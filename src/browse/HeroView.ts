/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type { Movie } from "../catalog/types";
import { finishTime, formatRuntime } from "./format";

/** @brief Render selected metadata safely and keep both tiny-library heroes warm. */
export class HeroView {
  private readonly images: Map<string, HTMLImageElement> = new Map();
  private selectedMovie: Movie;
  private readonly timer: number;
  private readonly timeFormat: Intl.DateTimeFormat;

  /** @brief Build independent image layers so late loads never replace selection. */
  public constructor(
    private readonly page: Document,
    movies: readonly Movie[],
  ) {
    this.selectedMovie = movies[0];
    this.timeFormat = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const artwork: HTMLElement = this.element("hero-artwork");
    movies.forEach((movie: Movie): void => {
      const image: HTMLImageElement = page.createElement("img");
      image.src = movie.fanart;
      image.alt = "";
      image.dataset.movieId = movie.id;
      image.draggable = false;
      // Every image owns its error state. It cannot change a newer hero's URL.
      image.addEventListener("error", (): void => {
        image.classList.add("is-missing");
      });
      artwork.append(image);
      this.images.set(movie.id, image);
    });
    this.show(movies[0]);
    this.timer = page.defaultView!.setInterval(
      (): void => this.updateClock(),
      15000,
    );
  }

  /** @brief Update text and image selection synchronously, with no image-load gate. */
  public show(movie: Movie): void {
    this.selectedMovie = movie;
    this.images.forEach((image: HTMLImageElement, id: string): void => {
      image.classList.toggle("is-selected", id === movie.id);
    });
    this.element("movie-title").textContent = movie.title;
    this.element("movie-plot").textContent = movie.plot;
    const tagline: HTMLElement = this.element("movie-tagline");
    tagline.textContent = movie.tagline;
    tagline.hidden = movie.tagline.length === 0;
    this.element("movie-resolution").textContent =
      movie.width >= 3840 ? "4K" : movie.width >= 1920 ? "FHD" : "HD";
    this.element("movie-runtime").textContent = formatRuntime(
      movie.durationSeconds,
    );
    this.element("movie-studio").textContent = movie.studio;
    this.updateClock();
  }

  /** @brief Release the clock owned by this view. */
  public dispose(): void {
    this.page.defaultView!.clearInterval(this.timer);
  }

  /** @brief Render local finish time, recalculated after background-tab resumes too. */
  public updateClock(): void {
    const finish: Date = finishTime(
      new Date(),
      this.selectedMovie.durationSeconds,
    );
    const time: HTMLTimeElement = this.element("ends-at") as HTMLTimeElement;
    time.dateTime = finish.toISOString();
    time.textContent = `Ends at ${this.timeFormat.format(finish)}`;
  }

  /** @brief Fail clearly if the page's required semantic structure is incomplete. */
  private element(id: string): HTMLElement {
    const element: HTMLElement | null = this.page.getElementById(id);
    if (element === null) {
      throw new Error(`Missing hero element: ${id}`);
    }
    return element;
  }
}
