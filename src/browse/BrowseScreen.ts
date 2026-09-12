/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { movies } from "../catalog/catalog";
import { resolveSource } from "../catalog/sources";
import type { Movie } from "../catalog/types";
import type { PlayerSnapshot } from "../player/types";
import { VideoPlayer } from "../player/VideoPlayer";
import { normalizeKey } from "./format";
import { HeroView } from "./HeroView";
import { MediaShelf } from "./MediaShelf";

/** @brief Own browsing and one player's lifecycle without sharing mutable global state. */
export class BrowseScreen {
  private readonly hero: HeroView;
  private readonly shelf: MediaShelf;
  private readonly player: VideoPlayer;
  private readonly browseSurface: HTMLElement;
  private readonly playerSurface: HTMLElement;
  private readonly video: HTMLVideoElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly studioButton: HTMLButtonElement;
  private selectedMovie: Movie = movies[0];
  private playbackVisible: boolean = false;
  private uiFullscreenPending: boolean = false;

  /** @brief Compose views, then prepare only the initial selected movie. */
  public constructor(private readonly page: Document) {
    this.browseSurface = this.element("browse-screen");
    this.playerSurface = this.element("player-screen");
    this.video = this.element("video-player") as HTMLVideoElement;
    this.returnButton = this.element("return-button") as HTMLButtonElement;
    this.fullscreenButton = this.element(
      "fullscreen-button",
    ) as HTMLButtonElement;
    this.studioButton = this.element("studio-fullscreen") as HTMLButtonElement;
    this.hero = new HeroView(page, movies);
    this.shelf = new MediaShelf(
      this.element("movie-shelf"),
      movies,
      (movie: Movie): void => this.select(movie),
      this.startPlayback,
    );
    this.player = new VideoPlayer(
      this.video,
      (snapshot: PlayerSnapshot): void => this.onPlayerState(snapshot),
    );
    this.page.addEventListener("keydown", this.handleKey);
    this.returnButton.addEventListener("click", this.returnToBrowse);
    this.fullscreenButton.addEventListener("click", this.startPlayback);
    this.studioButton.addEventListener("pointerdown", this.keepMovieFocus);
    this.studioButton.addEventListener("click", this.toggleUiFullscreen);
    this.page.addEventListener("fullscreenchange", this.updateUiFullscreen);
    this.updateUiFullscreen();
    this.select(this.selectedMovie);
  }

  /** @brief Dispose each actual owner, removing page listeners during HMR or teardown. */
  public async dispose(): Promise<void> {
    this.page.removeEventListener("keydown", this.handleKey);
    this.returnButton.removeEventListener("click", this.returnToBrowse);
    this.fullscreenButton.removeEventListener("click", this.startPlayback);
    this.studioButton.removeEventListener("pointerdown", this.keepMovieFocus);
    this.studioButton.removeEventListener("click", this.toggleUiFullscreen);
    this.page.removeEventListener("fullscreenchange", this.updateUiFullscreen);
    this.shelf.dispose();
    await this.player.dispose();
  }

  /** @brief Show selected metadata immediately, independent of media preparation. */
  private select(movie: Movie): void {
    this.selectedMovie = movie;
    this.hero.show(movie);
    this.video.setAttribute("aria-label", movie.title);
    this.player.prepare(resolveSource(movie.id));
  }

  /** @brief Hide video only when its owner has confirmed fullscreen exit. */
  private onPlayerState(snapshot: PlayerSnapshot): void {
    const wasPlaying: boolean = this.playbackVisible;
    this.playbackVisible =
      snapshot.state === "playing" || snapshot.state === "stopping";
    this.playerSurface.hidden = !this.playbackVisible;
    this.browseSurface.hidden = this.playbackVisible;
    this.element("browse-status").textContent =
      !this.playbackVisible && snapshot.state !== "preparing"
        ? snapshot.message
        : "";
    this.element("player-status").textContent = snapshot.message;
    this.shelf.update(snapshot);
    if (wasPlaying && !this.playbackVisible) {
      this.shelf.restoreFocus();
    }
  }

  /** @brief Stand down for native playback; handle delivered Back/Stop only in a session. */
  private readonly handleKey: (errEvent: KeyboardEvent) => void = (
    event: KeyboardEvent,
  ): void => {
    if (!this.playbackVisible) {
      this.shelf.handleKey(event);
      return;
    }
    const key: string = normalizeKey(event);
    if (
      key === "MediaStop" ||
      key === "BrowserBack" ||
      key === "GoBack" ||
      key === "Escape"
    ) {
      event.preventDefault();
      this.player.stop();
    }
  };

  private readonly returnToBrowse: () => void = (): void => this.player.stop();

  /** @brief Avoid competing UI/video requests without queuing a future Play. */
  private readonly startPlayback: () => void = (): void => {
    if (!this.uiFullscreenPending) {
      this.player.start();
    }
  };

  /** @brief Pointer activation must not move native focus away from a movie. */
  private readonly keepMovieFocus: (errEvent: PointerEvent) => void = (
    event: PointerEvent,
  ): void => {
    event.preventDefault();
  };

  /** @brief Reflect browser-owned state, including Escape and video transitions. */
  private readonly updateUiFullscreen: () => void = (): void => {
    this.studioButton.setAttribute(
      "aria-pressed",
      String(this.page.fullscreenElement === this.page.documentElement),
    );
  };

  /** @brief Toggle the page directly in the pointer gesture, leaving media idle. */
  private readonly toggleUiFullscreen: () => Promise<void> =
    async (): Promise<void> => {
      if (this.playbackVisible || this.uiFullscreenPending) {
        return;
      }
      const uiRoot: HTMLElement = this.page.documentElement;
      this.uiFullscreenPending = true;
      this.studioButton.setAttribute("aria-busy", "true");
      try {
        if (this.page.fullscreenElement === uiRoot) {
          await this.page.exitFullscreen();
        } else if (
          this.page.fullscreenElement === null &&
          this.page.fullscreenEnabled &&
          typeof uiRoot.requestFullscreen === "function"
        ) {
          // The document root also contains the player. A movie can therefore
          // take native fullscreen without hiding a fullscreen browse ancestor.
          await uiRoot.requestFullscreen({ navigationUI: "hide" });
        }
      } catch {
        // This optional shortcut leaves browsing intact if the browser denies
        // fullscreen. A later gesture can try again; no movie starts implicitly.
      } finally {
        this.uiFullscreenPending = false;
        this.studioButton.setAttribute("aria-busy", "false");
        this.updateUiFullscreen();
      }
    };

  /** @brief Verify required markup once at controller construction. */
  private element(id: string): HTMLElement {
    const element: HTMLElement | null = this.page.getElementById(id);
    if (element === null) {
      throw new Error(`Missing browsing element: ${id}`);
    }
    return element;
  }
}
