// The home connector's VM (DRIFT-001-73): infra/home/convert-qcow2.ps1 and
// infra/home/new-connector-vm.ps1, run by PowerShell 7. Nothing here creates a VM or downloads.
// - The converter turns a qcow2 image into a fixed VHD byte for byte as qemu-img does. The fixture
//   holds every kind of cluster: compressed, stored, zero-flagged, unallocated, and L2 tables that
//   are absent. It refuses what it does not read, by name, and leaves no file behind.
// - The VM script, against stand-ins for Hyper-V, the Storage cmdlets and curl.exe
//   (home-vm-harness.ps1):
//   - print-only, the default, calls nothing;
//   - with -Apply it checks, downloads and verifies, converts, writes the first-boot settings and
//     creates the VM as recorded;
//   - its first-boot settings never run the setup or start the connector, and replay the Hyper-V
//     devices to the guest tools' udev rules before starting their address daemon (DRIFT-001-74);
//   - it refuses a taken name, a missing switch or a wrong hash before changing anything, and
//     removes what it created when a later step fails.
// PowerShell 7 ships on the CI runner; without `pwsh` these fail in CI and are skipped elsewhere.
/* eslint-disable @typescript-eslint/naming-convention -- PowerShell parameter names */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CONVERTER = fileURLToPath(
  new URL("../../../infra/home/convert-qcow2.ps1", import.meta.url),
);
const VM_SCRIPT = fileURLToPath(
  new URL("../../../infra/home/new-connector-vm.ps1", import.meta.url),
);
const HARNESS = fileURLToPath(
  new URL("./home-vm-harness.ps1", import.meta.url),
);
const FIXTURE = fileURLToPath(
  new URL("../fixtures/qcow2/every-cluster-kind.qcow2", import.meta.url),
);
/** The fixture's disk, as `qemu-img convert -O raw` (qemu 9.0.2) writes it. */
const FIXTURE_DISK_BYTES = 196_608;
const FIXTURE_DISK_SHA256 =
  "91aef248a312274ce38ace8ee5d77707c0d2c828566613938b164b9aa962649a";
const FOOTER_BYTES = 512;
/** A terminal colour code: ESC [ ... m. */
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const RUN_TIMEOUT_MS = 60_000;

const HAS_PWSH =
  spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status === 0;
if (!HAS_PWSH && process.env.CI !== undefined) {
  throw new Error(
    "PowerShell 7 (pwsh) is required in CI for the home VM tests.",
  );
}

const folders: string[] = [];

function folder(): string {
  const path = mkdtempSync(join(tmpdir(), "ring-bridge-home-vm-"));
  folders.push(path);
  return path;
}

afterEach(() => {
  for (const path of folders.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function convert(source: string, destination: string) {
  const result = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      CONVERTER,
      "-Path",
      source,
      "-Destination",
      destination,
    ],
    { encoding: "utf8", timeout: RUN_TIMEOUT_MS },
  );
  // PowerShell's error view colours its lines and wraps a long message at the console's width (80
  // on a CI runner), continuing it on lines that start with "|": drop the colours, join the lines.
  const output = `${result.stdout}${result.stderr}`
    .replace(ANSI_ESCAPE, "")
    .replace(/\s*\r?\n\s*\|?[ \t]*/g, " ");
  return { status: result.status, output };
}

/** The fixture with some header bytes changed. */
function mutated(change: (bytes: Buffer) => void): string {
  const bytes = readFileSync(FIXTURE);
  change(bytes);
  const path = join(folder(), "mutated.qcow2");
  writeFileSync(path, bytes);
  return path;
}

describe.runIf(HAS_PWSH)(
  "the qcow2 converter (infra/home/convert-qcow2.ps1)",
  { timeout: RUN_TIMEOUT_MS },
  () => {
    it("writes the disk byte for byte as qemu-img does, every kind of cluster, then a fixed-VHD footer", () => {
      const destination = join(folder(), "disk.vhd");

      const { status, output } = convert(FIXTURE, destination);

      expect(status, output).toBe(0);
      const bytes = readFileSync(destination);
      expect(bytes.length).toBe(FIXTURE_DISK_BYTES + FOOTER_BYTES);
      expect(sha256(bytes.subarray(0, FIXTURE_DISK_BYTES))).toBe(
        FIXTURE_DISK_SHA256,
      );
      const footer = bytes.subarray(FIXTURE_DISK_BYTES);
      expect(footer.toString("ascii", 0, 8)).toBe("conectix");
      expect(footer.readUInt32BE(60)).toBe(2);
      expect(footer.toString("ascii", 28, 32)).toBe("win ");
      expect(footer.readBigUInt64BE(40)).toBe(BigInt(FIXTURE_DISK_BYTES));
      expect(footer.readBigUInt64BE(48)).toBe(BigInt(FIXTURE_DISK_BYTES));
      let sum = 0;
      footer.forEach((byte, offset) => {
        if (offset < 64 || offset >= 68) {
          sum += byte;
        }
      });
      expect(footer.readUInt32BE(64)).toBe(~sum >>> 0);
    });

    it.each([
      ["not a qcow2 image", (b: Buffer) => b.writeUInt32BE(0x12345678, 0)],
      ["qcow2 version 2", (b: Buffer) => b.writeUInt32BE(2, 4)],
      ["a backing file", (b: Buffer) => b.writeBigUInt64BE(4096n, 8)],
      ["encryption", (b: Buffer) => b.writeUInt32BE(1, 32)],
      ["snapshots", (b: Buffer) => b.writeUInt32BE(1, 60)],
      ["incompatible features 0x8", (b: Buffer) => b.writeBigUInt64BE(8n, 72)],
      [
        "points outside itself",
        (b: Buffer) => b.writeBigUInt64BE(1n << 40n, 40),
      ],
    ])("refuses %s, and leaves no file behind", (message, change) => {
      const destination = join(folder(), "disk.vhd");

      const { status, output } = convert(mutated(change), destination);

      expect(status).not.toBe(0);
      expect(output).toContain(message);
      expect(existsSync(destination)).toBe(false);
    });

    it("refuses a file cut short, and one already at the destination", () => {
      const short = join(folder(), "short.qcow2");
      writeFileSync(short, readFileSync(FIXTURE).subarray(0, 4096));
      const destination = join(folder(), "disk.vhd");

      const cut = convert(short, destination);

      expect(cut.status).not.toBe(0);
      expect(cut.output).toContain("outside");
      expect(existsSync(destination)).toBe(false);

      writeFileSync(destination, "keep");
      const taken = convert(FIXTURE, destination);
      expect(taken.status).not.toBe(0);
      expect(taken.output).toContain("already exists");
      expect(readFileSync(destination, "utf8")).toBe("keep");
    });
  },
);

interface World {
  readonly vmPath: string;
  readonly switches?: readonly string[];
  readonly vmExists?: boolean;
  readonly hyperVRefuses?: boolean;
  readonly sums?: string;
  readonly address?: string | null;
  readonly failOn?: string | null;
}

interface Run {
  readonly calls: readonly string[];
  readonly output: string;
  readonly exitCode: number;
}

const IMAGE_NAME = "noble-server-cloudimg-amd64.img";
const FIXTURE_SHA256 = sha256(readFileSync(FIXTURE));
const KEY_BODY =
  "AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyBodyForTheTestsOnly0123456789ab";

function keyFile(text = `ssh-ed25519 ${KEY_BODY} it's me@home\n`): string {
  const path = join(folder(), "id_ed25519.pub");
  writeFileSync(path, text);
  return path;
}

function parameters(overrides: Record<string, unknown> = {}) {
  return {
    SwitchName: "External",
    Image: "ghcr.io/example-owner/ring-mcp-bridge:0123abcd",
    CoreUrl: "wss://core.example.test/link",
    SshPublicKeyPath: keyFile(),
    ...overrides,
  };
}

function runVm(
  args: Record<string, unknown>,
  world: Partial<World> = {},
): Run & { vmFolder: string } {
  const vmPath = world.vmPath ?? folder();
  const fullWorld: World = {
    switches: ["External"],
    vmExists: false,
    hyperVRefuses: false,
    sums: `${FIXTURE_SHA256} *${IMAGE_NAME}\nffff *other.img\n`,
    address: "192.0.2.10",
    failOn: null,
    ...world,
    vmPath,
  };
  const result = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      HARNESS,
      "-ScriptPath",
      VM_SCRIPT,
    ],
    {
      encoding: "utf8",
      timeout: RUN_TIMEOUT_MS,
      env: {
        ...process.env,
        HOMEVM_ARGS: JSON.stringify(args),
        HOMEVM_WORLD: JSON.stringify({ ...fullWorld, image: FIXTURE }),
      },
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  const exit = /^EXIT (\d+)$/m.exec(output);
  return {
    calls: output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("CALL "))
      .map((line) => line.slice("CALL ".length)),
    output,
    exitCode: exit === null ? -1 : Number(exit[1]),
    vmFolder: join(
      vmPath,
      typeof args.VMName === "string" ? args.VMName : "ring-bridge",
    ),
  };
}

function commands(calls: readonly string[]): string[] {
  return calls.map((call) => call.split(" ")[0] ?? "");
}

describe.runIf(HAS_PWSH)(
  "the home connector's VM (infra/home/new-connector-vm.ps1)",
  { timeout: RUN_TIMEOUT_MS },
  () => {
    it("only prints its plan without -Apply, calling nothing", () => {
      const { calls, output, exitCode } = runVm(parameters());

      expect(exitCode).toBe(0);
      expect(calls).toEqual([]);
      expect(output).toContain("Print only");
      expect(output).toContain("never runs the setup");
    });

    it("creates the VM in the recorded order, as R10 sizes it", () => {
      const { calls, output, exitCode, vmFolder } = runVm(
        parameters({ Apply: true }),
      );

      expect(exitCode, output).toBe(0);
      expect(commands(calls)).toEqual([
        "Get-VMHost",
        "Get-VMSwitch",
        "Get-VM",
        "curl.exe",
        "curl.exe",
        "Convert-VHD",
        "Resize-VHD",
        "New-VHD",
        "Mount-VHD",
        "Initialize-Disk",
        "New-Partition",
        "Format-Volume",
        "Add-PartitionAccessPath",
        "Remove-PartitionAccessPath",
        "Dismount-VHD",
        "New-VM",
        "Set-VMMemory",
        "Set-VMProcessor",
        "Get-VMHardDiskDrive",
        "Set-VMFirmware",
        "Add-VMHardDiskDrive",
        "Set-VM",
        "Start-VM",
        "Get-VMNetworkAdapter",
      ]);
      const call = (name: string) =>
        calls.find((line) => line.startsWith(`${name} `)) ?? "";
      expect(calls[3]).toMatch(/--fail .*SHA256SUMS$/);
      expect(call("Resize-VHD")).toContain(
        `-SizeBytes ${String(20 * 2 ** 30)}`,
      );
      expect(call("Format-Volume")).toContain(
        "-FileSystem FAT32 -NewFileSystemLabel CIDATA",
      );
      expect(call("New-VM")).toContain("-Generation 2");
      expect(call("New-VM")).toContain(
        `-MemoryStartupBytes ${String(2 * 2 ** 30)}`,
      );
      expect(call("New-VM")).toContain("-SwitchName External");
      expect(call("Set-VMMemory")).toContain("-DynamicMemoryEnabled False");
      expect(call("Set-VMProcessor")).toContain("-Count 2");
      expect(call("Set-VMFirmware")).toContain(
        "-EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority",
      );
      expect(call("Add-VMHardDiskDrive")).toContain("ring-bridge-seed.vhdx");
      expect(call("Set-VM")).toContain(
        "-AutomaticStartAction Start -AutomaticStopAction ShutDown -CheckpointType Disabled",
      );
      expect(commands(calls)).not.toContain("Set-VMNetworkAdapterVlan");
      expect(output).toContain("ssh bridge@192.0.2.10");

      const disks = join(vmFolder, "Virtual Hard Disks");
      expect(existsSync(join(disks, "ring-bridge-os.vhdx"))).toBe(true);
      expect(existsSync(join(disks, "ring-bridge-os.vhd"))).toBe(false);
      expect(existsSync(join(vmFolder, "download"))).toBe(false);
    });

    it("writes first-boot settings that never run the setup or start the connector", () => {
      const { exitCode, output, vmFolder } = runVm(parameters({ Apply: true }));

      expect(exitCode, output).toBe(0);
      const userData = readFileSync(
        join(vmFolder, "first-boot", "user-data"),
        "utf8",
      );
      const metaData = readFileSync(
        join(vmFolder, "first-boot", "meta-data"),
        "utf8",
      );
      expect(userData.startsWith("#cloud-config\n")).toBe(true);
      expect(userData).not.toMatch(/\r|\t/);
      // The key's type and body only: its comment, with its quote, is left out.
      expect(userData).toContain(`      - 'ssh-ed25519 ${KEY_BODY}'\n`);
      expect(userData).not.toContain("me@home");
      expect(userData).toContain("lock_passwd: true");
      expect(userData).toContain("ssh_pwauth: false");
      expect(userData).toContain(
        "      IMAGE=ghcr.io/example-owner/ring-mcp-bridge:0123abcd\n",
      );
      expect(userData).toContain(
        "      BRIDGE_CORE_URL=wss://core.example.test/link\n",
      );
      const runcmd = userData.slice(userData.indexOf("runcmd:"));
      expect(runcmd).not.toMatch(/ring-bridge-(setup|start)|\bsetup\b/);
      expect(runcmd).toContain("docker pull");
      expect(runcmd).toContain("[chown, -R, '1000:1000', /srv/ring-bridge]");
      expect(userData).toContain("--restart unless-stopped");
      expect(userData).toContain("--log-opt max-size=10m --log-opt max-file=3");
      expect(metaData).toMatch(
        /^instance-id: ring-bridge-\d{14}\nlocal-hostname: ring-bridge\n$/,
      );
    });

    it("replays the Hyper-V devices to the guest tools' udev rules before starting their address daemon", () => {
      const { exitCode, output, vmFolder } = runVm(parameters({ Apply: true }));

      expect(exitCode, output).toBe(0);
      const userData = readFileSync(
        join(vmFolder, "first-boot", "user-data"),
        "utf8",
      );
      const runcmd = userData.slice(userData.indexOf("runcmd:"));
      // The rules come with the tools, after the boot made the devices: without the replay systemd
      // never sees the KVP device, the daemon bound to it does not start, and Hyper-V never learns
      // the VM's address (DRIFT-001-74).
      const order = [
        `apt-get install -y "linux-cloud-tools-$(uname -r)"`,
        "  - [udevadm, control, --reload]\n",
        "  - [udevadm, trigger, --action=add, --subsystem-match=misc]\n",
        "  - [udevadm, settle]\n",
        "  - [systemctl, enable, --now, hv-kvp-daemon.service]\n",
      ].map((line) => runcmd.indexOf(line));
      expect(
        order.every((index) => index >= 0),
        order.join(","),
      ).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("names the adapter's MAC address when the VM reports no address", () => {
      const { exitCode, output } = runVm(parameters({ Apply: true }), {
        address: null,
      });

      expect(exitCode, output).toBe(0);
      expect(output).toContain("Look for the MAC address 00-15-5D-0A-0B-0C");
      expect(output).toContain("ssh bridge@<the VM's address>");
    });

    it("tags the adapter with the VLAN when one is given", () => {
      const { calls, exitCode } = runVm(
        parameters({ Apply: true, VlanId: 30 }),
      );

      expect(exitCode).toBe(0);
      expect(calls).toContain(
        "Set-VMNetworkAdapterVlan -VMName ring-bridge -Access -VlanId 30",
      );
    });

    it.each([
      ["a VM by that name", { vmExists: true }, "already exists"],
      [
        "a switch that is missing",
        { switches: ["Internal"] },
        "No Hyper-V switch named 'External'",
      ],
      ["Hyper-V's refusal", { hyperVRefuses: true }, "run this elevated"],
    ])("stops on %s before changing anything", (_, world, message) => {
      const { calls, output, exitCode } = runVm(
        parameters({ Apply: true }),
        world,
      );

      expect(exitCode).toBe(1);
      expect(output).toContain(message);
      expect(commands(calls)).not.toContain("curl.exe");
      expect(commands(calls)).not.toContain("New-VM");
    });

    it("refuses an image that does not match SHA256SUMS, and deletes it", () => {
      const { calls, output, exitCode, vmFolder } = runVm(
        parameters({ Apply: true }),
        { sums: `${"0".repeat(64)} *${IMAGE_NAME}\n` },
      );

      expect(exitCode).toBe(1);
      expect(output).toContain("does not match SHA256SUMS");
      expect(commands(calls)).not.toContain("Convert-VHD");
      expect(existsSync(join(vmFolder, "download", IMAGE_NAME))).toBe(false);
    });

    it("removes what it created when a later step fails, keeping the downloaded image", () => {
      const { calls, output, exitCode, vmFolder } = runVm(
        parameters({ Apply: true }),
        { failOn: "Start-VM" },
      );

      expect(exitCode).toBe(1);
      expect(output).toContain("removing what this run created");
      expect(calls).toContain("Remove-VM -Name ring-bridge -Force");
      const disks = join(vmFolder, "Virtual Hard Disks");
      expect(existsSync(join(disks, "ring-bridge-os.vhdx"))).toBe(false);
      expect(existsSync(join(disks, "ring-bridge-seed.vhdx"))).toBe(false);
      expect(existsSync(join(vmFolder, "first-boot"))).toBe(false);
      expect(existsSync(join(vmFolder, "download", IMAGE_NAME))).toBe(true);
    });

    it("refuses a file that is not one SSH public key", () => {
      const { output, exitCode, calls } = runVm(
        parameters({
          Apply: true,
          SshPublicKeyPath: keyFile(
            `ssh-ed25519 ${KEY_BODY}\nssh-ed25519 ${KEY_BODY}\n`,
          ),
        }),
      );

      expect(exitCode).toBe(1);
      expect(output).toContain("does not hold one SSH public key");
      expect(calls).toEqual([]);
    });
  },
);
