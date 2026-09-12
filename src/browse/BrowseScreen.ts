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
  private selectedMovie: Movie = movies[0];
  private playbackVisible: boolean = false;

  /** @brief Compose views, then prepare only the initial selected movie. */
  public constructor(private readonly page: Document) {
    this.browseSurface = this.element("browse-screen");
    this.playerSurface = this.element("player-screen");
    this.video = this.element("video-player") as HTMLVideoElement;
    this.returnButton = this.element("return-button") as HTMLButtonElement;
    this.fullscreenButton = this.element(
      "fullscreen-button",
    ) as HTMLButtonElement;
    this.hero = new HeroView(page, movies);
    this.shelf = new MediaShelf(
      this.element("movie-shelf"),
      movies,
      (movie: Movie): void => this.select(movie),
      (): void => this.player.start(),
    );
    this.player = new VideoPlayer(
      this.video,
      (snapshot: PlayerSnapshot): void => this.onPlayerState(snapshot),
    );
    this.page.addEventListener("keydown", this.handleKey);
    this.returnButton.addEventListener("click", this.returnToBrowse);
    this.fullscreenButton.addEventListener("click", this.retryFullscreen);
    this.select(this.selectedMovie);
  }

  /** @brief Dispose each actual owner, removing page listeners during HMR or teardown. */
  public async dispose(): Promise<void> {
    this.page.removeEventListener("keydown", this.handleKey);
    this.returnButton.removeEventListener("click", this.returnToBrowse);
    this.fullscreenButton.removeEventListener("click", this.retryFullscreen);
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
  private readonly retryFullscreen: () => void = (): void =>
    this.player.start();

  /** @brief Verify required markup once at controller construction. */
  private element(id: string): HTMLElement {
    const element: HTMLElement | null = this.page.getElementById(id);
    if (element === null) {
      throw new Error(`Missing browsing element: ${id}`);
    }
    return element;
  }
}
