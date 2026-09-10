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

interface ShakaFixture {
  player: EventTarget;
  attach: Mock<() => Promise<void>>;
  load: Mock<() => Promise<void>>;
  isBrowserSupported: Mock<() => boolean>;
}

// Shaka needs a browser media engine and a network stream. Replace that external
// boundary while exercising the real application and its native event handlers.
const shakaFixture: ShakaFixture = vi.hoisted((): ShakaFixture => {
  return {
    player: new EventTarget(),
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

interface DocumentFixture {
  fullscreenEnabled: boolean;
  fullscreenElement: VideoFixture | null;
  exitFullscreen: Mock<() => Promise<void>>;
  querySelector: Mock<(errSelector: string) => EventTarget | null>;
}

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
    page = {
      fullscreenEnabled: true,
      fullscreenElement: null,
      exitFullscreen: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      querySelector: vi.fn<(errSelector: string) => EventTarget | null>(),
    };
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

  it("reveals the video and starts sound and fullscreen in the click gesture", async (): Promise<void> => {
    await prepareVideo();
    const playback: PromiseWithResolvers<void> = Promise.withResolvers<void>();
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
    expect(button.hidden).toBe(true);
    expect(button.disabled).toBe(true);
    playback.resolve();
    await vi.waitFor((): void => {
      expect(button.disabled).toBe(false);
    });
  });

  it("returns from fullscreen and replays without loading the stream again", async (): Promise<void> => {
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    page.fullscreenElement = video;
    video.currentTime = 120;

    video.dispatchEvent(new Event("ended"));

    expect(page.exitFullscreen).toHaveBeenCalledOnce();
    expect(video.style.visibility).toBe("hidden");
    expect(video.controls).toBe(false);
    expect(video.currentTime).toBe(0);
    expect(button.hidden).toBe(false);

    button.dispatchEvent(new Event("click"));
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

  it("uses iPhone video fullscreen when standard fullscreen is unavailable", async (): Promise<void> => {
    page.fullscreenEnabled = false;
    video.requestFullscreen = undefined;
    await prepareVideo();
    button.dispatchEvent(new Event("click"));
    expect(video.webkitEnterFullscreen).toHaveBeenCalledOnce();

    video.webkitDisplayingFullscreen = true;
    video.dispatchEvent(new Event("ended"));
    expect(video.webkitExitFullscreen).toHaveBeenCalledOnce();
    expect(button.hidden).toBe(false);
  });

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
