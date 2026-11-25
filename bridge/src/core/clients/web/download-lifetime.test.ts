import { expect, it } from "vitest";
import { DownloadLifetime } from "./download-lifetime.ts";

it("drains an audit registered while an interrupted request is settling", async () => {
  const downloads = new DownloadLifetime();
  const prepare = Promise.withResolvers<undefined>();
  const audit = Promise.withResolvers<undefined>();
  const request = downloads.track(
    prepare.promise.then(() => {
      void downloads.track(audit.promise);
    }),
  );
  const stopping = downloads.stop(new AbortController().signal);
  expect(downloads.signal.aborted).toBe(true);
  prepare.resolve(undefined);
  await request;
  let stopped = false;
  void stopping.then(() => {
    stopped = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(stopped).toBe(false);
  audit.resolve(undefined);
  await stopping;
});

it("ends the shutdown wait at its deadline if storage stalls", async () => {
  const downloads = new DownloadLifetime();
  const write = Promise.withResolvers<undefined>();
  const pending = downloads.track(write.promise);
  const deadline = new AbortController();
  const stopping = downloads.stop(deadline.signal);
  const reason = new Error("shutdown deadline");
  deadline.abort(reason);
  await expect(stopping).rejects.toBe(reason);
  write.resolve(undefined);
  await pending;
});
