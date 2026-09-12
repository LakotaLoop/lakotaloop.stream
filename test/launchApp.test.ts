/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import type { PlaybackSource, PlayerSnapshot } from "../src/player/types";
import { VideoPlayer } from "../src/player/VideoPlayer";

interface ShakaFixture {
  player: EventTarget;
  constructPlayer: Mock<() => void>;
  attach: Mock<() => Promise<void>>;
  detach: Mock<() => Promise<void>>;
  load: Mock<(errUrl: string) => Promise<void>>;
  unload: Mock<(errInitializeMediaSource?: boolean) => Promise<void>>;
  destroy: Mock<() => Promise<void>>;
  isBrowserSupported: Mock<() => boolean>;
}

// These explicitly labeled fault-injection tests replace browser API boundaries.
// Playwright separately proves decoding, native input, and real fullscreen.
const shakaFixture: ShakaFixture = vi.hoisted((): ShakaFixture => ({
  player: new EventTarget(),
  constructPlayer: vi.fn<() => void>(),
  attach: vi.fn<() => Promise<void>>(),
  detach: vi.fn<() => Promise<void>>(),
  load: vi.fn<(errUrl: string) => Promise<void>>(),
  unload: vi.fn<(errInitializeMediaSource?: boolean) => Promise<void>>(),
  destroy: vi.fn<() => Promise<void>>(),
  isBrowserSupported: vi.fn<() => boolean>(),
}));

vi.mock("shaka-player", (): object => ({
  default: {
    polyfill: { installAll: (): void => {} },
    Player: class {
      public static isBrowserSupported: () => boolean =
        shakaFixture.isBrowserSupported;
      public constructor() {
        shakaFixture.constructPlayer();
        return Object.assign(shakaFixture.player, {
          attach: shakaFixture.attach,
          detach: shakaFixture.detach,
          load: shakaFixture.load,
          unload: shakaFixture.unload,
          destroy: shakaFixture.destroy,
        });
      }
    },
    util: { Error: { Severity: { CRITICAL: 2 } } },
  },
}));

class DocumentFixture extends EventTarget {
  public fullscreenEnabled: boolean = true;
  public fullscreenElement: EventTarget | null = null;
  public exitFullscreen: Mock<() => Promise<void>> = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined);
}

class VideoFixture extends EventTarget {
  public controls: boolean = false;
  public style: { visibility: string } = { visibility: "hidden" };
  public muted: boolean = true;
  public volume: number = 0;
  public paused: boolean = true;
  public ended: boolean = false;
  public currentTime: number = 0;
  public readyState: number = 0;
  public error: MediaError | null = null;
  public src: string = "";
  public preload: string = "";
  public ownerDocument: Document;
  public play: Mock<() => Promise<void>> = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined);
  public pause: Mock<() => void> = vi.fn<() => void>();
  public load: Mock<() => void> = vi.fn<() => void>();
  public requestFullscreen: Mock<() => Promise<void>> | undefined = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined);
  public webkitEnterFullscreen: Mock<() => void> | undefined =
    vi.fn<() => void>();
  public webkitExitFullscreen: Mock<() => void> = vi.fn<() => void>();
  public webkitDisplayingFullscreen: boolean = false;
  public constructor(page: DocumentFixture) {
    super();
    this.ownerDocument = page as unknown as Document;
  }
  public removeAttribute(name: string): void {
    if (name === "src") {
      this.src = "";
    }
  }
}

const firstSource: PlaybackSource = {
  id: "intro",
  kind: "hls",
  url: "https://example.com/intro.m3u8",
};
const secondSource: PlaybackSource = {
  id: "rough-cut",
  kind: "hls",
  url: "https://example.com/rough-cut.m3u8",
};
type FullscreenApi = "standard" | "webkit";

describe("multi-session player fault injection", (): void => {
  let video: VideoFixture;
  let page: DocumentFixture;
  let player: VideoPlayer;
  let snapshots: PlayerSnapshot[];

  beforeEach((): void => {
    vi.resetAllMocks();
    shakaFixture.player = new EventTarget();
    shakaFixture.attach.mockResolvedValue(undefined);
    shakaFixture.detach.mockResolvedValue(undefined);
    shakaFixture.load.mockResolvedValue(undefined);
    shakaFixture.unload.mockResolvedValue(undefined);
    shakaFixture.destroy.mockResolvedValue(undefined);
    shakaFixture.isBrowserSupported.mockReturnValue(true);
    page = new DocumentFixture();
    video = new VideoFixture(page);
    snapshots = [];
    player = new VideoPlayer(
      video as unknown as HTMLVideoElement,
      (snapshot: PlayerSnapshot): void => {
        snapshots.push(snapshot);
      },
    );
  });

  afterEach(async (): Promise<void> => {
    // Confirm real exit before disposal so unresolved injected requests cannot
    // leave a test's listeners attached to the next test's document fixture.
    page.fullscreenElement = null;
    page.dispatchEvent(new Event("fullscreenchange"));
    video.webkitDisplayingFullscreen = false;
    video.dispatchEvent(new Event("webkitendfullscreen"));
    await player.dispose();
    vi.restoreAllMocks();
  });

  async function prepare(source: PlaybackSource = firstSource): Promise<void> {
    player.prepare(source);
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
  }

  function enter(api: FullscreenApi = "standard"): void {
    if (api === "standard") {
      page.fullscreenElement = video;
      page.dispatchEvent(new Event("fullscreenchange"));
    } else {
      video.webkitDisplayingFullscreen = true;
      video.dispatchEvent(new Event("webkitbeginfullscreen"));
    }
  }

  function leave(api: FullscreenApi = "standard"): void {
    if (api === "standard") {
      page.fullscreenElement = null;
      page.dispatchEvent(new Event("fullscreenchange"));
    } else {
      video.webkitDisplayingFullscreen = false;
      video.dispatchEvent(new Event("webkitendfullscreen"));
    }
  }

  function expectSurfaceVisible(): void {
    expect(video.style.visibility).toBe("visible");
    expect(video.controls).toBe(true);
    expect(["playing", "stopping"]).toContain(player.getSnapshot().state);
  }

  function expectLibrary(): void {
    expect(video.style.visibility).toBe("hidden");
    expect(video.controls).toBe(false);
    expect(["ready", "idle", "error"]).toContain(player.getSnapshot().state);
  }

  it("does not load or autoplay until explicitly prepared and started", async (): Promise<void> => {
    expect(player.getSnapshot().state).toBe("idle");
    player.start();
    expect(shakaFixture.constructPlayer).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
    const preparation: PromiseWithResolvers<void> =
      Promise.withResolvers<void>();
    shakaFixture.load.mockReturnValueOnce(preparation.promise);
    player.prepare(firstSource);
    await vi.waitFor((): void => {
      expect(shakaFixture.load).toHaveBeenCalledOnce();
    });
    expect(player.getSnapshot().state).toBe("preparing");
    player.start();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.requestFullscreen).not.toHaveBeenCalled();
    preparation.resolve();
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
    expect(video.play).not.toHaveBeenCalled();
    expect(shakaFixture.attach).toHaveBeenCalledExactlyOnceWith(video);
    expect(shakaFixture.load).toHaveBeenCalledExactlyOnceWith(firstSource.url);
  });

  it("deduplicates preparation and retains a single Shaka instance", async (): Promise<void> => {
    player.prepare(firstSource);
    player.prepare(firstSource);
    await prepare();
    player.prepare(firstSource);
    expect(shakaFixture.constructPlayer).toHaveBeenCalledOnce();
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it("reveals layout before native controls and calls audio and fullscreen synchronously", async (): Promise<void> => {
    await prepare();
    const playback: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    let nativeControls: boolean = false;
    Object.defineProperty(video, "controls", {
      get: (): boolean => nativeControls,
      set: (enabled: boolean): void => {
        if (enabled) {
          expect(video.style.visibility).toBe("visible");
        }
        nativeControls = enabled;
      },
    });
    video.play.mockImplementation((): Promise<void> => {
      expect(video.controls).toBe(true);
      expect(video.muted).toBe(false);
      expect(video.volume).toBe(1);
      return playback.promise;
    });
    player.start();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.requestFullscreen).toHaveBeenCalledExactlyOnceWith({
      navigationUI: "hide",
    });
    expect(video.play.mock.invocationCallOrder[0]).toBeLessThan(
      video.requestFullscreen!.mock.invocationCallOrder[0],
    );
    expectSurfaceVisible();
    playback.resolve();
  });

  it.each(["standard", "webkit"] as const)(
    "stops on an established %s fullscreen exit and keeps prepared replay",
    async (api: FullscreenApi): Promise<void> => {
      if (api === "webkit") {
        page.fullscreenEnabled = false;
        video.requestFullscreen = undefined;
      }
      await prepare();
      player.start();
      enter(api);
      const pausesBeforeExit: number = video.pause.mock.calls.length;
      leave(api);
      expect(video.pause.mock.calls.length).toBeGreaterThan(pausesBeforeExit);
      expectLibrary();
      player.start();
      expect(video.play).toHaveBeenCalledTimes(2);
      expect(shakaFixture.load).toHaveBeenCalledOnce();
    },
  );

  it.each(["standard", "webkit"] as const)(
    "waits for actual %s exit after natural end",
    async (api: FullscreenApi): Promise<void> => {
      if (api === "webkit") {
        page.fullscreenEnabled = false;
        video.requestFullscreen = undefined;
      }
      await prepare();
      player.start();
      enter(api);
      video.currentTime = 120;
      video.ended = true;
      video.dispatchEvent(new Event("ended"));
      video.dispatchEvent(new Event("ended"));
      expectSurfaceVisible();
      expect(player.getSnapshot().state).toBe("stopping");
      await Promise.resolve();
      expectSurfaceVisible();
      if (api === "standard") {
        expect(page.exitFullscreen).toHaveBeenCalledOnce();
      } else {
        expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
      }
      leave(api);
      expectLibrary();
      expect(video.currentTime).toBe(0);
    },
  );

  it("does not stop on unrelated exit notifications or ordinary native pause", async (): Promise<void> => {
    await prepare();
    player.start();
    page.dispatchEvent(new Event("fullscreenchange"));
    video.dispatchEvent(new Event("webkitendfullscreen"));
    video.dispatchEvent(new Event("pause"));
    expectSurfaceVisible();
    expect(player.getSnapshot().state).toBe("playing");
  });

  it("keeps native pause usable when it aborts a pending play", async (): Promise<void> => {
    await prepare();
    video.play.mockRejectedValueOnce(new DOMException("Paused", "AbortError"));
    player.start();
    await Promise.resolve();
    expectSurfaceVisible();
    expect(player.getSnapshot().message).toBe("");
  });

  it("offers a fresh gesture after denied audio without reloading", async (): Promise<void> => {
    await prepare();
    video.play.mockRejectedValueOnce(
      new DOMException("Denied", "NotAllowedError"),
    );
    player.start();
    await vi.waitFor((): void => {
      expect(player.getSnapshot().message).toContain("Play");
    });
    expectLibrary();
    player.start();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it("keeps denied fullscreen inline with native controls and a retry message", async (): Promise<void> => {
    await prepare();
    video.requestFullscreen?.mockRejectedValueOnce(new Error("Denied"));
    player.start();
    await vi.waitFor((): void => {
      expect(player.getSnapshot().message).toContain("Fullscreen");
    });
    expectSurfaceVisible();
    player.start();
    expect(video.requestFullscreen).toHaveBeenCalledTimes(2);
  });

  it("returns inline natural completion immediately without reloading", async (): Promise<void> => {
    await prepare();
    player.start();
    await Promise.resolve();
    video.currentTime = 120;
    video.ended = true;
    video.dispatchEvent(new Event("ended"));
    expectLibrary();
    expect(video.currentTime).toBe(0);
    player.start();
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it.each(["reject", "throw"] as const)(
    "retains recoverable native UI when fullscreen exit methods %s",
    async (failure: "reject" | "throw"): Promise<void> => {
      if (failure === "reject") {
        page.exitFullscreen.mockRejectedValueOnce(new Error("Failed"));
      } else {
        page.exitFullscreen.mockImplementationOnce((): Promise<void> => {
          throw new Error("Failed");
        });
      }
      await prepare();
      player.start();
      enter();
      player.stop();
      await vi.waitFor((): void => {
        expect(player.getSnapshot().message).toContain("exit");
      });
      expectSurfaceVisible();
      expect(player.getSnapshot().state).toBe("playing");
      leave();
      expectLibrary();
    },
  );

  it("keeps WebKit exit failures recoverable until manual Done", async (): Promise<void> => {
    page.fullscreenEnabled = false;
    video.requestFullscreen = undefined;
    video.webkitExitFullscreen.mockImplementationOnce((): void => {
      throw new Error("Failed");
    });
    await prepare();
    player.start();
    enter("webkit");
    player.stop();
    expectSurfaceVisible();
    expect(player.getSnapshot().message).toContain("exit");
    leave("webkit");
    expectLibrary();
  });

  it("does not resurrect stopped playback from a late play fulfillment", async (): Promise<void> => {
    await prepare();
    const playback: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    video.play.mockReturnValueOnce(playback.promise);
    player.start();
    await Promise.resolve();
    player.stop();
    playback.resolve();
    await playback.promise;
    video.dispatchEvent(new Event("playing"));
    expectLibrary();
    expect(player.getSnapshot().state).toBe("ready");
  });

  it("preserves the surface when stopped before a delayed fullscreen entry", async (): Promise<void> => {
    const entry: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    video.requestFullscreen?.mockReturnValueOnce(entry.promise);
    await prepare();
    player.start();
    player.stop();
    expectSurfaceVisible();
    enter();
    entry.resolve();
    expect(page.exitFullscreen).toHaveBeenCalledOnce();
    expectSurfaceVisible();
    leave();
    expectLibrary();
  });

  it("settles a canceled fullscreen attempt when its late entry is denied", async (): Promise<void> => {
    const entry: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    video.requestFullscreen?.mockReturnValueOnce(entry.promise);
    await prepare();
    player.start();
    player.stop();
    entry.reject(new Error("Denied"));
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
    expectLibrary();
  });

  it("isolates an old exit rejection from the next session's stop", async (): Promise<void> => {
    const exitRequest: PromiseWithResolvers<void> =
      Promise.withResolvers<void>();
    page.exitFullscreen.mockReturnValueOnce(exitRequest.promise);
    await prepare();
    player.start();
    enter();
    player.stop();
    leave();
    player.start();
    enter();
    player.stop();
    exitRequest.reject(new Error("Old exit"));
    await Promise.resolve();
    expect(player.getSnapshot().state).toBe("stopping");
    leave();
    expectLibrary();
  });

  it("serializes rapid source switches and ignores stale load completion", async (): Promise<void> => {
    const firstLoad: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    shakaFixture.load.mockReturnValueOnce(firstLoad.promise);
    player.prepare(firstSource);
    await vi.waitFor((): void => {
      expect(shakaFixture.load).toHaveBeenCalledOnce();
    });
    player.prepare(secondSource);
    expect(player.getSnapshot()).toMatchObject({
      state: "preparing",
      sourceId: secondSource.id,
    });
    expect(shakaFixture.load).toHaveBeenCalledOnce();
    firstLoad.resolve();
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
    expect(shakaFixture.load).toHaveBeenLastCalledWith(secondSource.url);
    expect(player.getSnapshot().sourceId).toBe(secondSource.id);
    expect(
      snapshots.some(
        (snapshot: PlayerSnapshot): boolean =>
          snapshot.state === "ready" && snapshot.sourceId === firstSource.id,
      ),
    ).toBe(false);
    expect(shakaFixture.constructPlayer).toHaveBeenCalledOnce();
  });

  it("cancels preparation without autoplay and permits a later retry", async (): Promise<void> => {
    const firstLoad: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    shakaFixture.load.mockReturnValueOnce(firstLoad.promise);
    player.prepare(firstSource);
    await vi.waitFor((): void => {
      expect(shakaFixture.load).toHaveBeenCalledOnce();
    });
    player.stop();
    firstLoad.resolve();
    await firstLoad.promise;
    expect(player.getSnapshot().state).toBe("idle");
    expect(video.play).not.toHaveBeenCalled();
    await prepare();
    player.start();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("keeps recoverable Shaka errors in playback but requires fresh preparation after fatal errors", async (): Promise<void> => {
    await prepare();
    player.start();
    await Promise.resolve();
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 1 } }),
    );
    expectSurfaceVisible();
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expectLibrary();
    expect(player.getSnapshot().state).toBe("error");
    player.start();
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
    expect(video.play).toHaveBeenCalledOnce();
    player.start();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.constructPlayer).toHaveBeenCalledOnce();
  });

  it("returns a preparation failure to a retryable state", async (): Promise<void> => {
    shakaFixture.load.mockRejectedValueOnce(new Error("Network unavailable"));
    player.prepare(firstSource);
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("error");
    });
    player.start();
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
    expect(video.play).not.toHaveBeenCalled();
    player.start();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("prepares direct MP4s only after real media readiness and keeps them distinct", async (): Promise<void> => {
    const mp4: PlaybackSource = {
      id: "local-intro",
      kind: "mp4",
      url: "/test-media/intro.mp4",
    };
    player.prepare(mp4);
    await vi.waitFor((): void => {
      expect(video.src).toBe(mp4.url);
    });
    expect(player.getSnapshot().state).toBe("preparing");
    expect(shakaFixture.constructPlayer).not.toHaveBeenCalled();
    video.readyState = 2;
    video.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("ready");
    });
    player.start();
    expect(video.play).toHaveBeenCalledOnce();
    expect(player.getSnapshot().sourceId).toBe(mp4.id);
  });

  it("exposes unavailable configuration honestly and disposes owned resources", async (): Promise<void> => {
    player.prepare(null);
    expect(player.getSnapshot().state).toBe("error");
    expect(player.getSnapshot().message).toContain("not configured");
    await prepare();
    await player.dispose();
    expect(shakaFixture.destroy).toHaveBeenCalledOnce();
    const snapshotCount: number = snapshots.length;
    video.dispatchEvent(new Event("ended"));
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expect(snapshots).toHaveLength(snapshotCount);
  });

  it("retains a pending WebKit surface until begin and end events settle stop", async (): Promise<void> => {
    page.fullscreenEnabled = false;
    video.requestFullscreen = undefined;
    await prepare();
    player.start();
    player.stop();
    expect(player.getSnapshot().state).toBe("stopping");
    expectSurfaceVisible();
    enter("webkit");
    expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
    leave("webkit");
    expectLibrary();
  });

  it("keeps media resources until actual fullscreen exit during disposal", async (): Promise<void> => {
    await prepare();
    player.start();
    enter();
    const disposal: Promise<void> = player.dispose();
    await Promise.resolve();
    expect(shakaFixture.destroy).not.toHaveBeenCalled();
    expectSurfaceVisible();
    leave();
    await disposal;
    expect(shakaFixture.destroy).toHaveBeenCalledOnce();
    expectLibrary();
  });

  it("keeps fatal fullscreen errors visible until exit and exposes Retry afterwards", async (): Promise<void> => {
    await prepare();
    player.start();
    enter();
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expectSurfaceVisible();
    expect(player.getSnapshot().state).toBe("stopping");
    leave();
    expectLibrary();
    expect(player.getSnapshot().state).toBe("error");
    expect(player.getSnapshot().message).toContain("Retry");
  });

  it("ignores a stopped session's late play rejection during a new session", async (): Promise<void> => {
    await prepare();
    const oldPlayback: PromiseWithResolvers<void> =
      Promise.withResolvers<void>();
    video.play.mockReturnValueOnce(oldPlayback.promise);
    player.start();
    await Promise.resolve();
    player.stop();
    await prepare(secondSource);
    player.start();
    oldPlayback.reject(new Error("Old media failure"));
    await Promise.resolve();
    expectSurfaceVisible();
    expect(player.getSnapshot().sourceId).toBe(secondSource.id);
    expect(player.getSnapshot().message).toBe("");
  });

  it("cancels without waiting for a replacement MediaSource to open", async (): Promise<void> => {
    await prepare();
    const unusedSourceOpen: PromiseWithResolvers<void> =
      Promise.withResolvers<void>();
    shakaFixture.unload.mockImplementation(
      (initializeMediaSource: boolean = true): Promise<void> => {
        return initializeMediaSource
          ? unusedSourceOpen.promise
          : Promise.resolve();
      },
    );
    try {
      await prepare(secondSource);
      expect(player.getSnapshot().sourceId).toBe(secondSource.id);
    } finally {
      unusedSourceOpen.resolve();
    }
  });

  it("keeps separate players' Shaka errors scoped to their own video", async (): Promise<void> => {
    await prepare();
    const firstShakaPlayer: EventTarget = shakaFixture.player;
    shakaFixture.player = new EventTarget();
    const secondVideo: VideoFixture = new VideoFixture(page);
    const secondPlayer: VideoPlayer = new VideoPlayer(
      secondVideo as unknown as HTMLVideoElement,
      (): void => {},
    );
    try {
      secondPlayer.prepare(secondSource);
      await vi.waitFor((): void => {
        expect(secondPlayer.getSnapshot().state).toBe("ready");
      });
      player.start();
      secondPlayer.start();
      await Promise.resolve();
      firstShakaPlayer.dispatchEvent(
        new CustomEvent("error", { detail: { severity: 2 } }),
      );
      expect(player.getSnapshot().state).toBe("error");
      expect(secondPlayer.getSnapshot().state).toBe("playing");
      expect(secondVideo.pause).not.toHaveBeenCalled();
    } finally {
      await secondPlayer.dispose();
    }
  });

  it("silences native resume while stop is waiting for fullscreen exit", async (): Promise<void> => {
    await prepare();
    player.start();
    enter();
    player.stop();
    const pausesBeforeResume: number = video.pause.mock.calls.length;
    video.dispatchEvent(new Event("playing"));
    expect(video.pause.mock.calls.length).toBeGreaterThan(pausesBeforeResume);
    expect(player.getSnapshot().state).toBe("stopping");
    leave();
    expectLibrary();
  });

  it("keeps the latest selection when it returns to the playing source during fullscreen exit", async (): Promise<void> => {
    await prepare();
    player.start();
    enter();
    player.prepare(secondSource);
    expect(player.getSnapshot().state).toBe("stopping");
    player.prepare(firstSource);
    expectSurfaceVisible();
    leave();
    await vi.waitFor((): void => {
      expect(player.getSnapshot()).toMatchObject({
        state: "ready",
        sourceId: firstSource.id,
      });
    });
    player.start();
    expect(player.getSnapshot().sourceId).toBe(firstSource.id);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it("ignores a queued ended event from the old movie after a source switch", async (): Promise<void> => {
    await prepare();
    player.start();
    await Promise.resolve();
    player.stop();
    await prepare(secondSource);
    player.start();
    // DOM events do not carry a source identity. The current media flag is
    // authoritative when an earlier source's queued event arrives late.
    video.ended = false;
    video.dispatchEvent(new Event("ended"));
    expect(player.getSnapshot()).toMatchObject({
      state: "playing",
      sourceId: secondSource.id,
    });
    expectSurfaceVisible();
  });

  it("ignores a cleared old MP4 error while the replacement movie prepares", async (): Promise<void> => {
    const firstMp4: PlaybackSource = {
      id: firstSource.id,
      kind: "mp4",
      url: "/test-media/intro.mp4",
    };
    const secondMp4: PlaybackSource = {
      id: secondSource.id,
      kind: "mp4",
      url: "/test-media/rough-cut.mp4",
    };
    player.prepare(firstMp4);
    await vi.waitFor((): void => {
      expect(video.src).toBe(firstMp4.url);
    });
    player.prepare(secondMp4);
    await vi.waitFor((): void => {
      expect(video.src).toBe(secondMp4.url);
    });
    // A new native load clears MediaError before old queued events are drained.
    video.error = null;
    video.dispatchEvent(new Event("error"));
    video.readyState = 2;
    video.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor((): void => {
      expect(player.getSnapshot()).toMatchObject({
        state: "ready",
        sourceId: secondMp4.id,
      });
    });
  });

  it("still reports a current native MP4 preparation error", async (): Promise<void> => {
    const mp4: PlaybackSource = {
      id: firstSource.id,
      kind: "mp4",
      url: "/test-media/intro.mp4",
    };
    player.prepare(mp4);
    await vi.waitFor((): void => {
      expect(video.src).toBe(mp4.url);
    });
    video.error = { code: 2, message: "Network failure" } as MediaError;
    video.dispatchEvent(new Event("error"));
    await vi.waitFor((): void => {
      expect(player.getSnapshot().state).toBe("error");
    });
    expect(player.getSnapshot().message).toContain("Retry");
  });
});
