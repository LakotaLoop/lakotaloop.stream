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

import { launchApp } from "../src/app/launchApp";
import { VideoPlayer } from "../src/player/VideoPlayer";

interface ShakaFixture {
  player: EventTarget;
  constructPlayer: Mock<() => void>;
  attach: Mock<() => Promise<void>>;
  load: Mock<() => Promise<void>>;
  isBrowserSupported: Mock<() => boolean>;
}

// Shaka needs a browser media engine and a network stream. Replace that external
// boundary while exercising the real application and its native event handlers.
const shakaFixture: ShakaFixture = vi.hoisted((): ShakaFixture => {
  return {
    player: new EventTarget(),
    constructPlayer: vi.fn<() => void>(),
    attach: vi.fn<() => Promise<void>>(),
    load: vi.fn<() => Promise<void>>(),
    isBrowserSupported: vi.fn<() => boolean>(),
  };
});

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
          load: shakaFixture.load,
        });
      }
    },
    util: { Error: { Severity: { CRITICAL: 2 } } },
  },
}));

/** Only browser media and fullscreen operations are simulated in these tests. */
class VideoFixture extends EventTarget {
  public controls: boolean = false;
  public style: { visibility: string } = { visibility: "hidden" };
  public muted: boolean = true;
  public volume: number = 0;
  public paused: boolean = false;
  public currentTime: number = 0;
  public error: MediaError | null = null;
  public ownerDocument: Document = document;
  public play: Mock<() => Promise<void>> = vi.fn<() => Promise<void>>();
  public pause: Mock<() => void> = vi.fn<() => void>();
  public requestFullscreen: Mock<() => Promise<void>> | undefined = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined);
  public webkitEnterFullscreen: Mock<() => void> = vi.fn<() => void>();
  public webkitExitFullscreen: Mock<() => void> = vi.fn<() => void>();
  public webkitDisplayingFullscreen: boolean = false;
}

class ButtonFixture extends EventTarget {
  public hidden: boolean = false;
  public disabled: boolean = true;
  public title: string = "";
  public attributes: Map<string, string> = new Map<string, string>();

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "title") {
      this.title = "";
    }
  }
}

/** Fullscreen transitions are reported by the document independently of requests. */
class DocumentFixture extends EventTarget {
  public fullscreenEnabled: boolean = true;
  public fullscreenElement: EventTarget | null = null;
  public exitFullscreen: Mock<() => Promise<void>> = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined);
  public querySelector: Mock<(errSelector: string) => EventTarget | null> =
    vi.fn<(errSelector: string) => EventTarget | null>();
}

type FullscreenApi = "standard" | "webkit";

describe("video page", (): void => {
  let video: VideoFixture;
  let button: ButtonFixture;
  let page: DocumentFixture;

  beforeEach((): void => {
    vi.resetAllMocks();
    shakaFixture.player = new EventTarget();
    shakaFixture.attach.mockResolvedValue(undefined);
    shakaFixture.load.mockResolvedValue(undefined);
    shakaFixture.isBrowserSupported.mockReturnValue(true);
    page = new DocumentFixture();
    vi.stubGlobal("document", page);
    video = new VideoFixture();
    video.play.mockResolvedValue(undefined);
    button = new ButtonFixture();
    page.querySelector.mockImplementation(
      (selector: string): EventTarget | null => {
        return selector === "#background-video" ? video : button;
      },
    );
    vi.spyOn(console, "error").mockImplementation((): void => {});
    vi.spyOn(console, "warn").mockImplementation((): void => {});
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Wait for preparation through the user-visible ready state. */
  async function prepareVideo(): Promise<void> {
    launchApp();
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });
  }

  /** The browser must retain its video surface and controls during fullscreen. */
  function expectVideoVisible(): void {
    expect(video.style.visibility).toBe("visible");
    expect(video.controls).toBe(true);
    expect(button.hidden).toBe(true);
  }

  /** The inline idle state restores the page's explicit play/retry action. */
  function expectPlayButtonVisible(): void {
    expect(video.style.visibility).toBe("hidden");
    expect(video.controls).toBe(false);
    expect(button.hidden).toBe(false);
  }

  it("rejects a page without the required video element", (): void => {
    page.querySelector.mockReturnValue(null);
    expect((): void => launchApp()).toThrow("missing from the page");
  });

  it("disables play until the stream has finished preparing", async (): Promise<void> => {
    const preparation: PromiseWithResolvers<void> =
      Promise.withResolvers<void>();
    shakaFixture.load.mockReturnValueOnce(preparation.promise);

    launchApp();
    await vi.waitFor((): void => {
      expect(shakaFixture.load).toHaveBeenCalledOnce();
    });
    expect(button.disabled).toBe(true);
    expect(video.play).not.toHaveBeenCalled();

    preparation.resolve();
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });
  });

  it("defers preparation until initialization and wires each callback only once", async (): Promise<void> => {
    const player: VideoPlayer = new VideoPlayer(
      video as unknown as HTMLVideoElement,
      button as unknown as HTMLButtonElement,
      "https://example.com/video.m3u8",
    );
    button.dispatchEvent(new Event("click"));
    expect(video.play).not.toHaveBeenCalled();
    expect(shakaFixture.isBrowserSupported).not.toHaveBeenCalled();
    expect(shakaFixture.constructPlayer).not.toHaveBeenCalled();

    player.initialize();
    player.initialize();
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });
    player.initialize();
    expect(shakaFixture.constructPlayer).toHaveBeenCalledOnce();
    expect(shakaFixture.attach).toHaveBeenCalledExactlyOnceWith(video);
    expect(shakaFixture.load).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/video.m3u8",
    );
    expect(shakaFixture.attach.mock.invocationCallOrder[0]).toBeLessThan(
      shakaFixture.load.mock.invocationCallOrder[0],
    );

    button.dispatchEvent(new Event("click"));
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.requestFullscreen).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("error"));
    expect(video.pause).toHaveBeenCalledOnce();
    expect(button.attributes.get("aria-label")).toContain("Retry");
  });

  it("keeps playback and error callbacks scoped to their own player instance", async (): Promise<void> => {
    await prepareVideo();
    const firstShakaPlayer: EventTarget = shakaFixture.player;
    const secondVideo: VideoFixture = new VideoFixture();
    const secondButton: ButtonFixture = new ButtonFixture();
    secondVideo.play.mockResolvedValue(undefined);
    shakaFixture.player = new EventTarget();
    const secondPlayer: VideoPlayer = new VideoPlayer(
      secondVideo as unknown as HTMLVideoElement,
      secondButton as unknown as HTMLButtonElement,
      "https://example.com/second.m3u8",
    );
    secondPlayer.initialize();
    await vi.waitFor((): void => {
      expect(secondButton.disabled).toBe(false);
    });

    button.dispatchEvent(new Event("click"));
    expect(secondVideo.play).not.toHaveBeenCalled();
    secondButton.dispatchEvent(new Event("click"));
    expect(secondVideo.play).toHaveBeenCalledOnce();
    firstShakaPlayer.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expectPlayButtonVisible();
    expect(secondVideo.pause).not.toHaveBeenCalled();
    expect(secondButton.hidden).toBe(true);

    // The second prepared stream survives the first instance's fatal failure.
    secondVideo.dispatchEvent(new Event("ended"));
    secondButton.dispatchEvent(new Event("click"));
    expect(secondVideo.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledTimes(2);
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expect(secondVideo.pause).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(secondButton.attributes.get("aria-label")).toContain("Retry");
  });

  it("reveals the video and starts sound and fullscreen in the click gesture", async (): Promise<void> => {
    await prepareVideo();
    const playback: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    // Observe the setter itself: checking only at play() would miss controls
    // being enabled while the video's layout was still hidden.
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
      expect(video.style.visibility).toBe("visible");
      expect(video.controls).toBe(true);
      expect(video.muted).toBe(false);
      expect(video.volume).toBe(1);
      return playback.promise;
    });

    button.dispatchEvent(new Event("click"));

    // These assertions run before any promises settle: deferring either browser
    // call can lose the user activation required for audio or fullscreen.
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.requestFullscreen).toHaveBeenCalledWith({
      navigationUI: "hide",
    });
    expect(video.play.mock.invocationCallOrder[0]).toBeLessThan(
      video.requestFullscreen!.mock.invocationCallOrder[0],
    );
    expect(button.hidden).toBe(true);
    expect(button.disabled).toBe(true);
    playback.resolve();
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });
  });

  it("waits for the video's standard fullscreen exit before offering replay", async (): Promise<void> => {
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    page.fullscreenElement = video;
    video.currentTime = 120;

    video.dispatchEvent(new Event("ended"));

    expect(page.exitFullscreen).toHaveBeenCalledOnce();
    expectVideoVisible();

    // Duplicate end events and fullscreen entry notifications cannot finish an
    // outstanding exit or ask the browser to leave fullscreen a second time.
    video.dispatchEvent(new Event("ended"));
    page.dispatchEvent(new Event("fullscreenchange"));
    expectVideoVisible();
    expect(page.exitFullscreen).toHaveBeenCalledOnce();

    // Another element owning fullscreen also confirms this video has exited.
    page.fullscreenElement = button;
    page.dispatchEvent(new Event("fullscreenchange"));
    expectPlayButtonVisible();
    expect(video.currentTime).toBe(0);

    page.fullscreenElement = null;
    button.dispatchEvent(new Event("click"));
    page.dispatchEvent(new Event("fullscreenchange"));
    expectVideoVisible();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
    expect(page.exitFullscreen).toHaveBeenCalledOnce();
  });

  it("does not treat a resolved fullscreen exit request as an exit event", async (): Promise<void> => {
    const exitRequest: PromiseWithResolvers<void> =
      Promise.withResolvers<void>();
    page.exitFullscreen.mockReturnValueOnce(exitRequest.promise);
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    page.fullscreenElement = video;
    video.dispatchEvent(new Event("ended"));

    // Request settlement and the browser's presentation event are independent.
    exitRequest.resolve();
    await exitRequest.promise;
    expectVideoVisible();

    page.fullscreenElement = null;
    page.dispatchEvent(new Event("fullscreenchange"));
    expectPlayButtonVisible();
  });

  it("returns inline playback to Play immediately and reuses the stream", async (): Promise<void> => {
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    video.currentTime = 120;

    video.dispatchEvent(new Event("ended"));

    expectPlayButtonVisible();
    expect(video.currentTime).toBe(0);
    expect(page.exitFullscreen).not.toHaveBeenCalled();
    expect(video.webkitExitFullscreen).not.toHaveBeenCalled();

    button.dispatchEvent(new Event("click"));
    expectVideoVisible();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it("keeps a prepared stream ready after audio permission is denied", async (): Promise<void> => {
    await prepareVideo();
    video.play.mockRejectedValueOnce(
      new DOMException("Audio denied", "NotAllowedError"),
    );
    button.dispatchEvent(new Event("click"));
    await vi.waitFor((): void => {
      expect(button.hidden).toBe(false);
    });
    expect(button.attributes.get("aria-label")).toContain("Retry");

    button.dispatchEvent(new Event("click"));
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("playing"));
    expect(button.attributes.get("aria-label")).toBe("Play video with sound");
    expect(button.title).toBe("");
  });

  it("keeps native controls available when pause cancels a pending play", async (): Promise<void> => {
    await prepareVideo();
    video.paused = true;
    video.play.mockRejectedValueOnce(new DOMException("Paused", "AbortError"));
    button.dispatchEvent(new Event("click"));
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });

    expect(video.style.visibility).toBe("visible");
    expect(video.controls).toBe(true);
    expect(button.hidden).toBe(true);
    expect(button.title).toBe("");
  });

  it("lets Shaka recover transient errors and reloads after a critical error", async (): Promise<void> => {
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 1 } }),
    );
    expect(button.hidden).toBe(true);

    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expect(button.hidden).toBe(false);
    expect(video.pause).toHaveBeenCalledOnce();
    button.dispatchEvent(new Event("click"));
    await vi.waitFor((): void => {
      expect(video.play).toHaveBeenCalledTimes(2);
    });
    expect(shakaFixture.load).toHaveBeenCalledTimes(2);
    expect(shakaFixture.constructPlayer).toHaveBeenCalledOnce();

    // Retrying must reuse the player without attaching another error listener.
    shakaFixture.player.dispatchEvent(
      new CustomEvent("error", { detail: { severity: 2 } }),
    );
    expect(video.pause).toHaveBeenCalledTimes(2);
  });

  it("offers a working retry after stream preparation fails", async (): Promise<void> => {
    shakaFixture.load.mockRejectedValueOnce(new Error("Network unavailable"));
    await prepareVideo();
    expect(button.hidden).toBe(false);
    expect(button.attributes.get("aria-label")).toContain("Retry");

    button.dispatchEvent(new Event("click"));
    await vi.waitFor((): void => {
      expect(video.play).toHaveBeenCalledOnce();
    });
    expect(shakaFixture.load).toHaveBeenCalledTimes(2);
  });

  it("waits for iPhone fullscreen exit before offering replay", async (): Promise<void> => {
    page.fullscreenEnabled = false;
    video.requestFullscreen = undefined;
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    expect(video.webkitEnterFullscreen).toHaveBeenCalledOnce();

    video.webkitDisplayingFullscreen = true;
    video.dispatchEvent(new Event("ended"));
    expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
    expectVideoVisible();

    // WebKit has a separate presentation event; returning from its exit method
    // or receiving a duplicate ended event does not confirm the transition.
    video.dispatchEvent(new Event("ended"));
    video.webkitDisplayingFullscreen = false;
    expectVideoVisible();
    expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("webkitendfullscreen"));
    expectPlayButtonVisible();

    button.dispatchEvent(new Event("click"));
    video.dispatchEvent(new Event("webkitendfullscreen"));
    expectVideoVisible();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
    expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
  });

  it.each(["standard", "webkit"] as const)(
    "keeps active playback visible after a manual %s fullscreen exit",
    async (fullscreenApi: FullscreenApi): Promise<void> => {
      if (fullscreenApi === "webkit") {
        page.fullscreenEnabled = false;
        video.requestFullscreen = undefined;
      }
      await prepareVideo();
      button.dispatchEvent(new Event("click"));

      // The browser's Done/Escape action changes presentation without ending
      // playback, so it must preserve the inline video and native controls.
      if (fullscreenApi === "standard") {
        page.fullscreenElement = video;
        page.dispatchEvent(new Event("fullscreenchange"));
        page.fullscreenElement = null;
        page.dispatchEvent(new Event("fullscreenchange"));
      } else {
        video.webkitDisplayingFullscreen = true;
        video.dispatchEvent(new Event("webkitbeginfullscreen"));
        video.webkitDisplayingFullscreen = false;
        video.dispatchEvent(new Event("webkitendfullscreen"));
      }

      expectVideoVisible();
      expect(video.pause).not.toHaveBeenCalled();
      expect(page.exitFullscreen).not.toHaveBeenCalled();
      expect(video.webkitExitFullscreen).not.toHaveBeenCalled();
    },
  );

  it.each(["reject", "throw"] as const)(
    "keeps fullscreen usable and cancels the pending return when standard exit methods %s",
    async (failureMode: "reject" | "throw"): Promise<void> => {
      const exitError: Error = new Error("Fullscreen exit failed");
      if (failureMode === "reject") {
        page.exitFullscreen.mockRejectedValueOnce(exitError);
      } else {
        page.exitFullscreen.mockImplementationOnce((): Promise<void> => {
          throw exitError;
        });
      }
      await prepareVideo();
      button.dispatchEvent(new Event("click"));
      page.fullscreenElement = video;

      video.dispatchEvent(new Event("ended"));

      await vi.waitFor((): void => {
        expect(console.warn).toHaveBeenCalledWith(
          "Could not leave fullscreen",
          exitError,
        );
      });
      expectVideoVisible();

      // A later manual exit must not finish the canceled return to Play.
      page.fullscreenElement = null;
      page.dispatchEvent(new Event("fullscreenchange"));
      expectVideoVisible();
      expect(page.exitFullscreen).toHaveBeenCalledOnce();
    },
  );

  it("keeps fullscreen usable and cancels the pending return when WebKit exit throws", async (): Promise<void> => {
    const exitError: Error = new Error("Fullscreen exit failed");
    page.fullscreenEnabled = false;
    video.requestFullscreen = undefined;
    video.webkitExitFullscreen.mockImplementationOnce((): void => {
      throw exitError;
    });
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    video.webkitDisplayingFullscreen = true;

    video.dispatchEvent(new Event("ended"));

    expect(console.warn).toHaveBeenCalledWith(
      "Could not leave fullscreen",
      exitError,
    );
    expectVideoVisible();

    video.webkitDisplayingFullscreen = false;
    video.dispatchEvent(new Event("webkitendfullscreen"));
    expectVideoVisible();
    expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
  });

  it("keeps a native-controls replay visible when an earlier exit completes", async (): Promise<void> => {
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    page.fullscreenElement = video;
    video.dispatchEvent(new Event("ended"));

    // Native controls can resume before the requested fullscreen exit finishes.
    video.dispatchEvent(new Event("playing"));
    page.fullscreenElement = null;
    page.dispatchEvent(new Event("fullscreenchange"));

    expectVideoVisible();
    expect(page.exitFullscreen).toHaveBeenCalledOnce();
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it("does not let an old exit rejection cancel the next replay's pending return", async (): Promise<void> => {
    const firstExit: PromiseWithResolvers<void> = Promise.withResolvers<void>();
    const exitError: Error = new Error("Earlier exit request rejected");
    page.exitFullscreen.mockReturnValueOnce(firstExit.promise);
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    page.fullscreenElement = video;
    video.dispatchEvent(new Event("ended"));
    page.fullscreenElement = null;
    page.dispatchEvent(new Event("fullscreenchange"));
    expectPlayButtonVisible();

    button.dispatchEvent(new Event("click"));
    page.fullscreenElement = video;
    video.dispatchEvent(new Event("ended"));

    // Promise callbacks from the first exit may arrive after replay has ended.
    // They must not discard the second exit's independent pending transition.
    firstExit.reject(exitError);
    await vi.waitFor((): void => {
      expect(console.warn).toHaveBeenCalledWith(
        "Could not leave fullscreen",
        exitError,
      );
    });
    expectVideoVisible();
    page.fullscreenElement = null;
    page.dispatchEvent(new Event("fullscreenchange"));

    expectPlayButtonVisible();
    expect(page.exitFullscreen).toHaveBeenCalledTimes(2);
    expect(shakaFixture.load).toHaveBeenCalledOnce();
  });

  it.each(["standard", "webkit"] as const)(
    "waits for %s fullscreen exit after a critical error before offering Retry",
    async (fullscreenApi: FullscreenApi): Promise<void> => {
      if (fullscreenApi === "webkit") {
        page.fullscreenEnabled = false;
        video.requestFullscreen = undefined;
      }
      await prepareVideo();
      button.dispatchEvent(new Event("click"));
      if (fullscreenApi === "standard") {
        page.fullscreenElement = video;
      } else {
        video.webkitDisplayingFullscreen = true;
      }

      shakaFixture.player.dispatchEvent(
        new CustomEvent("error", { detail: { severity: 2 } }),
      );

      expectVideoVisible();
      expect(video.pause).toHaveBeenCalledOnce();
      if (fullscreenApi === "standard") {
        expect(page.exitFullscreen).toHaveBeenCalledOnce();
        page.fullscreenElement = null;
        page.dispatchEvent(new Event("fullscreenchange"));
      } else {
        expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
        video.webkitDisplayingFullscreen = false;
        video.dispatchEvent(new Event("webkitendfullscreen"));
      }
      expectPlayButtonVisible();
      expect(button.attributes.get("aria-label")).toContain("Retry");

      // A critical failure invalidates the prepared stream, unlike normal end.
      button.dispatchEvent(new Event("click"));
      await vi.waitFor((): void => {
        expect(video.play).toHaveBeenCalledTimes(2);
      });
      expect(shakaFixture.load).toHaveBeenCalledTimes(2);
      expectVideoVisible();
    },
  );

  it("continues playing inline when fullscreen is denied", async (): Promise<void> => {
    video.requestFullscreen?.mockRejectedValueOnce(
      new Error("Fullscreen denied"),
    );
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });

    expect(video.style.visibility).toBe("visible");
    expect(video.controls).toBe(true);
    expect(button.hidden).toBe(true);
    expect(video.pause).not.toHaveBeenCalled();
  });
});
