#Requires -Version 5.1
<#
.SYNOPSIS
Converts a qcow2 disk image, such as Ubuntu's cloud image, to a fixed VHD that Hyper-V can attach.

.DESCRIPTION
Hyper-V reads VHD and VHDX but not qcow2, and Windows has no converter of its own. This one reads
only what Ubuntu's cloud images use, and refuses anything else by name rather than guessing:
- qcow2 version 3, with no incompatible feature bit set (so zlib compression, no external data
  file, no extended L2 entries), no encryption, no backing file and no snapshots;
- clusters that are unallocated, all zeros, stored as they are, or compressed with deflate.
Every offset read from the file is checked against its length, since the file is a download.

The output is the disk's bytes followed by a 512-byte fixed-VHD footer, so it is a fixed VHD.
Convert-VHD (Hyper-V) then makes a dynamic VHDX of it. Runs on Windows PowerShell 5.1 and on
PowerShell 7.

.EXAMPLE
pwsh infra/home/convert-qcow2.ps1 -Path noble-server-cloudimg-amd64.img -Destination noble.vhd
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $Path,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $Destination
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# C# 5, which Windows PowerShell 5.1 compiles: no string interpolation, no expression bodies.
$source = @'
using System;
using System.IO;
using System.IO.Compression;

public static class RingBridgeQcow2
{
    const uint Magic = 0x514649FB;
    const ulong L1Reserved = 0x7F000000000001FFUL;
    const ulong L2Reserved = 0x3F000000000001FEUL;
    const ulong OffsetMask = 0x00FFFFFFFFFFFE00UL;
    const ulong CompressedFlag = 1UL << 62;
    const ulong ZeroFlag = 1UL;
    const long MaxVhdBytes = 2040L * 1024 * 1024 * 1024;

    static ulong U64(byte[] b, long o)
    {
        ulong v = 0;
        for (int i = 0; i < 8; i++) { v = (v << 8) | b[o + i]; }
        return v;
    }

    static uint U32(byte[] b, long o)
    {
        uint v = 0;
        for (int i = 0; i < 4; i++) { v = (v << 8) | b[o + i]; }
        return v;
    }

    static void PutU64(byte[] b, int o, ulong v)
    {
        for (int i = 7; i >= 0; i--) { b[o + i] = (byte)(v & 0xFF); v >>= 8; }
    }

    static void PutU32(byte[] b, int o, uint v)
    {
        for (int i = 3; i >= 0; i--) { b[o + i] = (byte)(v & 0xFF); v >>= 8; }
    }

    static void ReadAt(Stream s, long offset, byte[] buffer, int count)
    {
        if (offset < 0 || offset + count > s.Length)
        {
            throw new InvalidDataException("The image points outside itself (offset " + offset + ", " + count + " bytes, file " + s.Length + " bytes).");
        }
        s.Position = offset;
        int done = 0;
        while (done < count)
        {
            int n = s.Read(buffer, done, count - done);
            if (n <= 0) { throw new EndOfStreamException("The image ended early."); }
            done += n;
        }
    }

    static void Refuse(string what)
    {
        throw new NotSupportedException("This qcow2 image uses " + what + ", which this converter does not read. Use the Ubuntu cloud image it was written for.");
    }

    // The fixed-VHD footer (Virtual Hard Disk Image Format Specification): Hyper-V's creator tag,
    // so readers take the size from the footer rather than from the geometry.
    public static byte[] Footer(long size, Guid id, DateTime now)
    {
        byte[] f = new byte[512];
        byte[] cookie = System.Text.Encoding.ASCII.GetBytes("conectix");
        Array.Copy(cookie, 0, f, 0, 8);
        PutU32(f, 8, 2);
        PutU32(f, 12, 0x00010000);
        PutU64(f, 16, 0xFFFFFFFFFFFFFFFFUL);
        PutU32(f, 24, (uint)(now - new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds);
        Array.Copy(System.Text.Encoding.ASCII.GetBytes("win "), 0, f, 28, 4);
        PutU32(f, 32, 0x000A0000);
        PutU32(f, 36, 0x5769326B);
        PutU64(f, 40, (ulong)size);
        PutU64(f, 48, (ulong)size);
        long sectors = Math.Min(size / 512, 65535L * 16 * 255);
        long perTrack, heads, cylinderTimesHeads;
        if (sectors >= 65535L * 16 * 63)
        {
            perTrack = 255; heads = 16; cylinderTimesHeads = sectors / perTrack;
        }
        else
        {
            perTrack = 17; cylinderTimesHeads = sectors / perTrack;
            heads = Math.Max((cylinderTimesHeads + 1023) / 1024, 4);
            if (cylinderTimesHeads >= heads * 1024 || heads > 16)
            {
                perTrack = 31; heads = 16; cylinderTimesHeads = sectors / perTrack;
            }
            if (cylinderTimesHeads >= heads * 1024)
            {
                perTrack = 63; heads = 16; cylinderTimesHeads = sectors / perTrack;
            }
        }
        long cylinders = cylinderTimesHeads / heads;
        f[56] = (byte)(cylinders >> 8);
        f[57] = (byte)(cylinders & 0xFF);
        f[58] = (byte)heads;
        f[59] = (byte)perTrack;
        PutU32(f, 60, 2);
        Array.Copy(id.ToByteArray(), 0, f, 68, 16);
        uint sum = 0;
        for (int i = 0; i < 512; i++) { sum += f[i]; }
        PutU32(f, 64, ~sum);
        return f;
    }

    // Writes the disk's bytes, then the footer; returns the disk's size in bytes.
    public static long ToFixedVhd(string sourcePath, string destinationPath)
    {
        using (FileStream input = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (FileStream output = new FileStream(destinationPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        {
            byte[] h = new byte[104];
            ReadAt(input, 0, h, 104);
            if (U32(h, 0) != Magic) { throw new InvalidDataException("This is not a qcow2 image."); }
            uint version = U32(h, 4);
            if (version != 3) { Refuse("qcow2 version " + version); }
            if (U64(h, 8) != 0 || U32(h, 16) != 0) { Refuse("a backing file"); }
            int clusterBits = (int)U32(h, 20);
            if (clusterBits < 9 || clusterBits > 21) { throw new InvalidDataException("The cluster size is out of range."); }
            long size = (long)U64(h, 24);
            if (U32(h, 32) != 0) { Refuse("encryption"); }
            long l1Size = U32(h, 36);
            long l1Offset = (long)U64(h, 40);
            if (U32(h, 60) != 0) { Refuse("snapshots"); }
            ulong incompatible = U64(h, 72);
            if (incompatible != 0) { Refuse("incompatible features 0x" + incompatible.ToString("x")); }
            if (U32(h, 100) < 104) { throw new InvalidDataException("The header is too short for version 3."); }
            if (size <= 0 || size % 512 != 0 || size > MaxVhdBytes)
            {
                throw new InvalidDataException("The disk's size, " + size + " bytes, cannot be a VHD.");
            }

            long clusterSize = 1L << clusterBits;
            long l2Entries = clusterSize / 8;
            long clusters = (size + clusterSize - 1) / clusterSize;
            if (l1Size < (clusters + l2Entries - 1) / l2Entries || l1Size > 32 * 1024 * 1024)
            {
                throw new InvalidDataException("The L1 table does not cover the disk.");
            }
            if (l1Offset % clusterSize != 0) { throw new InvalidDataException("The L1 table is not aligned."); }
            byte[] l1 = new byte[l1Size * 8];
            ReadAt(input, l1Offset, l1, l1.Length);

            int compressedShift = 62 - (clusterBits - 8);
            ulong compressedOffsetMask = (1UL << compressedShift) - 1;
            byte[] l2 = new byte[clusterSize];
            byte[] cluster = new byte[clusterSize];
            output.SetLength(size);

            for (long i = 0; i < l1Size && i * l2Entries < clusters; i++)
            {
                ulong l1Entry = U64(l1, i * 8);
                if ((l1Entry & L1Reserved) != 0) { throw new InvalidDataException("An L1 entry has reserved bits set."); }
                long l2Offset = (long)(l1Entry & OffsetMask);
                if (l2Offset == 0) { continue; }
                if (l2Offset % clusterSize != 0) { throw new InvalidDataException("An L2 table is not aligned."); }
                ReadAt(input, l2Offset, l2, l2.Length);

                for (long j = 0; j < l2Entries; j++)
                {
                    long guest = i * l2Entries + j;
                    if (guest >= clusters) { break; }
                    ulong entry = U64(l2, j * 8);
                    int length = (int)Math.Min(clusterSize, size - guest * clusterSize);
                    if ((entry & CompressedFlag) != 0)
                    {
                        long hostOffset = (long)(entry & compressedOffsetMask);
                        long sectors = (long)((entry & ~CompressedFlag & ~(1UL << 63)) >> compressedShift) + 1;
                        long compressedLength = sectors * 512 - (hostOffset & 511);
                        if (hostOffset <= 0 || hostOffset >= input.Length)
                        {
                            throw new InvalidDataException("A compressed cluster points outside the image.");
                        }
                        compressedLength = Math.Min(compressedLength, input.Length - hostOffset);
                        byte[] compressed = new byte[compressedLength];
                        ReadAt(input, hostOffset, compressed, compressed.Length);
                        using (DeflateStream inflate = new DeflateStream(new MemoryStream(compressed), CompressionMode.Decompress))
                        {
                            int done = 0;
                            while (done < clusterSize)
                            {
                                int n = inflate.Read(cluster, done, (int)clusterSize - done);
                                if (n <= 0) { break; }
                                done += n;
                            }
                            if (done < length) { throw new InvalidDataException("A compressed cluster is short."); }
                        }
                    }
                    else
                    {
                        if ((entry & L2Reserved) != 0) { throw new InvalidDataException("An L2 entry has reserved bits set."); }
                        if ((entry & ZeroFlag) != 0) { continue; }
                        long hostOffset = (long)(entry & OffsetMask);
                        if (hostOffset == 0) { continue; }
                        if (hostOffset % clusterSize != 0) { throw new InvalidDataException("A cluster is not aligned."); }
                        ReadAt(input, hostOffset, cluster, length);
                    }
                    output.Position = guest * clusterSize;
                    output.Write(cluster, 0, length);
                }
            }

            output.Position = size;
            byte[] footer = Footer(size, Guid.NewGuid(), DateTime.UtcNow);
            output.Write(footer, 0, footer.Length);
            return size;
        }
    }
}
'@

if (-not ('RingBridgeQcow2' -as [type])) {
    Add-Type -TypeDefinition $source -Language CSharp
}

$from = (Resolve-Path -LiteralPath $Path).ProviderPath
$to = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
if (Test-Path -LiteralPath $to) {
    throw "The destination '$to' already exists; nothing was written."
}
try {
    $size = [RingBridgeQcow2]::ToFixedVhd($from, $to)
}
catch {
    # .NET, not Remove-Item: Remove-Item fails on a path with 8.3 short names (C:\Users\ADMINI~1).
    if ([IO.File]::Exists($to)) {
        [IO.File]::Delete($to)
    }
    $reason = $_.Exception
    while ($reason.InnerException) {
        $reason = $reason.InnerException
    }
    throw "The image was not converted: $($reason.Message)"
}
Write-Verbose "Converted: $([math]::Round($size / 1GB, 2)) GB disk."
