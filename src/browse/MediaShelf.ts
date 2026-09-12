/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type { Movie } from "../catalog/types";
import type { PlayerSnapshot } from "../player/types";
import { normalizeKey } from "./format";

/** @brief Keep visual selection, DOM focus and deliberate playback intent distinct. */
export class MediaShelf {
  private readonly container: HTMLElement;
  private readonly movies: readonly Movie[];
  private readonly onSelect: (errMovie: Movie) => void;
  private readonly onPlay: () => void;
  private readonly cards: HTMLButtonElement[] = [];
  private selectedIndex: number = 0;
  private armed: boolean = false;
  private pointerIntent: { index: number; wasArmed: boolean } | null = null;
  private pointerFocus: boolean = false;
  private lastMousePosition: { x: number; y: number } | null = null;
  private preparationIndicatorTimer: number | null = null;
  private showPreparation: boolean = false;
  private snapshot: PlayerSnapshot = {
    state: "idle",
    sourceId: null,
    message: "",
  };
  private readonly cleanups: (() => void)[] = [];

  /** @brief Build a data-driven row; initial preview deliberately starts unarmed. */
  public constructor(
    container: HTMLElement,
    movies: readonly Movie[],
    onSelect: (errMovie: Movie) => void,
    onPlay: () => void,
  ) {
    this.container = container;
    this.movies = movies;
    this.onSelect = onSelect;
    this.onPlay = onPlay;
    movies.forEach((movie: Movie, index: number): void =>
      this.createCard(movie, index),
    );
    // Track movement across the whole document, including the player. Layout
    // changes under a parked mouse must not undo keyboard selection or Return.
    const page: Document = this.container.ownerDocument;
    page.addEventListener("pointermove", this.handleMouseMove, {
      passive: true,
    });
    this.cleanups.push((): void =>
      page.removeEventListener("pointermove", this.handleMouseMove),
    );
    this.render();
  }

  /** @brief Reflect preparation without disabling navigation or queuing playback. */
  public update(snapshot: PlayerSnapshot): void {
    const preparationChanged: boolean =
      this.snapshot.state !== snapshot.state ||
      this.snapshot.sourceId !== snapshot.sourceId;
    this.snapshot = snapshot;
    if (preparationChanged) {
      this.clearPreparationIndicator();
      if (snapshot.state === "preparing") {
        // Fast background preparation stays visually quiet. A slow connection
        // gets a separate notice without replacing or shifting the Play action.
        this.preparationIndicatorTimer =
          this.container.ownerDocument.defaultView!.setTimeout((): void => {
            this.preparationIndicatorTimer = null;
            this.showPreparation = true;
            this.render();
          }, 400);
      }
    }
    this.render();
  }

  /** @brief Restore the originating action after the player's actual exit completes. */
  public restoreFocus(): void {
    this.armed = true;
    this.pointerFocus = false;
    this.pointerIntent = null;
    this.cards[this.selectedIndex].focus({ preventScroll: true });
    this.render();
  }

  /** @brief Handle only reachable shelf actions, leaving all media keys to the player. */
  public handleKey(event: KeyboardEvent): void {
    // Safari may use Option-Tab for native button traversal. It still changes
    // input modality, while the browser retains the actual focus movement.
    if (event.key === "Tab") {
      this.pointerFocus = false;
      this.pointerIntent = null;
      return;
    }
    // Browser/OS shortcuts (especially Alt+Left Back) remain browser-owned.
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    this.pointerFocus = false;
    this.pointerIntent = null;
    const key: string = normalizeKey(event);
    const focused: boolean = this.cards.includes(
      this.container.ownerDocument.activeElement as HTMLButtonElement,
    );
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const nextIndex: number = Math.max(
        0,
        Math.min(
          this.cards.length - 1,
          this.selectedIndex + (key === "ArrowLeft" ? -1 : 1),
        ),
      );
      event.preventDefault();
      this.select(nextIndex);
      this.cards[nextIndex].focus({ preventScroll: true });
    } else if ((key === "ArrowUp" || key === "ArrowDown") && !focused) {
      event.preventDefault();
      this.select(this.selectedIndex);
      this.cards[this.selectedIndex].focus({ preventScroll: true });
    } else if ((key === "Enter" || key === " ") && focused && event.repeat) {
      // Native buttons provide the one non-repeated Enter/Space activation.
      event.preventDefault();
    } else if (key === "Enter" && focused && event.key !== "Enter") {
      // A legacy remote's unidentified keyCode has no native button default.
      event.preventDefault();
      this.activate(this.selectedIndex, true);
    }
  }

  /** @brief Remove listeners owned by the shelf before replacing its controller. */
  public dispose(): void {
    this.clearPreparationIndicator();
    this.cleanups.forEach((cleanup: () => void): void => cleanup());
  }

  /** @brief Adopt real mouse movement as navigation, never as a Play gesture. */
  private readonly handleMouseMove: (errEvent: PointerEvent) => void = (
    event: PointerEvent,
  ): void => {
    // Touch can generate pointer boundary events and compatibility clicks. It
    // retains its deliberate first-tap selection without being armed by hover.
    if (event.pointerType !== "mouse") {
      return;
    }
    const previousPosition: { x: number; y: number } | null =
      this.lastMousePosition;
    this.lastMousePosition = { x: event.clientX, y: event.clientY };
    if (
      (previousPosition?.x === event.clientX &&
        previousPosition.y === event.clientY) ||
      event.buttons !== 0 ||
      this.snapshot.state === "playing" ||
      this.snapshot.state === "stopping" ||
      this.container.getClientRects().length === 0
    ) {
      return;
    }
    const path: EventTarget[] = event.composedPath();
    const index: number = this.cards.findIndex(
      (card: HTMLButtonElement): boolean => path.includes(card),
    );
    if (index < 0) {
      return;
    }
    const card: HTMLButtonElement = this.cards[index];
    if (
      this.selectedIndex === index &&
      this.armed &&
      this.container.ownerDocument.activeElement === card
    ) {
      return;
    }
    this.pointerFocus = false;
    this.pointerIntent = null;
    this.select(index);
    card.focus({ preventScroll: true });
  };

  /** @brief Retire the previous source's notice on readiness, replacement, or disposal. */
  private clearPreparationIndicator(): void {
    if (this.preparationIndicatorTimer !== null) {
      this.container.ownerDocument.defaultView!.clearTimeout(
        this.preparationIndicatorTimer,
      );
      this.preparationIndicatorTimer = null;
    }
    this.showPreparation = false;
  }

  /** @brief Create normal buttons and safe text nodes, keeping artwork geometry fixed. */
  private createCard(movie: Movie, index: number): void {
    const page: Document = this.container.ownerDocument;
    const card: HTMLButtonElement = page.createElement("button");
    card.type = "button";
    card.className = "movie-card";
    card.dataset.movieId = movie.id;
    const artwork: HTMLSpanElement = page.createElement("span");
    artwork.className = "card-artwork";
    const image: HTMLImageElement = page.createElement("img");
    image.src = movie.landscape;
    image.alt = "";
    image.draggable = false;
    image.addEventListener("error", (): void => {
      image.hidden = true;
    });
    const overlay: HTMLSpanElement = page.createElement("span");
    overlay.className = "card-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const triangle: HTMLSpanElement = page.createElement("span");
    triangle.className = "play-triangle";
    const action: HTMLSpanElement = page.createElement("span");
    action.className = "card-action";
    const loading: HTMLSpanElement = page.createElement("span");
    loading.className = "card-loading";
    loading.title = "Preparing…";
    loading.hidden = true;
    overlay.append(triangle, action, loading);
    artwork.append(image, overlay);
    const title: HTMLSpanElement = page.createElement("span");
    title.className = "card-title";
    title.textContent = movie.title;
    card.append(artwork, title);
    this.cards.push(card);
    this.container.append(card);

    const rememberPointer: EventListener = (): void => {
      this.pointerFocus = true;
      // Capture intent BEFORE pointer focus. The same gesture cannot both arm
      // and play, including WebKit's synthesized mouse/click sequence after touch.
      this.pointerIntent = {
        index,
        wasArmed: this.armed && this.selectedIndex === index,
      };
    };
    const focus: EventListener = (): void => {
      if (!this.pointerFocus) {
        this.select(index);
      }
    };
    const click: EventListener = (event: Event): void => {
      const intent: { index: number; wasArmed: boolean } | null =
        this.pointerIntent;
      const keyboard: boolean =
        (event as MouseEvent).detail === 0 && intent === null;
      const shouldPlay: boolean =
        keyboard ||
        (intent !== null
          ? intent.index === index && intent.wasArmed
          : this.selectedIndex === index && this.armed);
      this.pointerIntent = null;
      this.activate(index, shouldPlay);
      // Safari does not necessarily focus a pointer-clicked button. Keep real
      // focus on the selected movie so switching to Enter stays predictable.
      if (!keyboard) {
        card.focus({ preventScroll: true });
      }
    };
    // Pointer events are preferred. The fallback supports older Safari without
    // handling touchend/pointerup as an extra activation source.
    const pointerEvents: string[] =
      "PointerEvent" in page.defaultView!
        ? ["pointerdown"]
        : ["touchstart", "mousedown"];
    pointerEvents.forEach((type: string): void => {
      card.addEventListener(type, rememberPointer, { passive: true });
      this.cleanups.push((): void =>
        card.removeEventListener(type, rememberPointer),
      );
    });
    card.addEventListener("focus", focus);
    card.addEventListener("click", click);
    this.cleanups.push((): void => {
      card.removeEventListener("focus", focus);
      card.removeEventListener("click", click);
    });
  }

  /** @brief Selecting updates the hero synchronously; asynchronous preparation is separate. */
  private select(index: number): void {
    const changed: boolean = this.selectedIndex !== index;
    this.selectedIndex = index;
    this.armed = true;
    this.render();
    if (changed) {
      this.onSelect(this.movies[index]);
    }
  }

  /** @brief Consume one native activation, requiring preexisting pointer intent to play. */
  private activate(index: number, shouldPlay: boolean): void {
    const alreadySelected: boolean = this.selectedIndex === index;
    this.select(index);
    if (shouldPlay && alreadySelected) {
      if (this.snapshot.state === "preparing") {
        // An explicit busy activation gets immediate feedback, but is never
        // queued to start playback or request fullscreen after the gesture ends.
        this.showPreparation = true;
        this.render();
        return;
      }
      this.onPlay();
    }
  }

  /** @brief Update only affordances; card dimensions and full titles never change. */
  private render(): void {
    this.cards.forEach((card: HTMLButtonElement, index: number): void => {
      const selected: boolean = index === this.selectedIndex;
      const readyIntent: boolean = selected && this.armed;
      const currentSource: boolean =
        selected && this.snapshot.sourceId === this.movies[index].id;
      const busy: boolean =
        currentSource && this.snapshot.state === "preparing";
      const error: boolean = currentSource && this.snapshot.state === "error";
      card.classList.toggle("is-selected", selected);
      card.classList.toggle("is-armed", readyIntent);
      card.setAttribute("aria-pressed", String(selected));
      card.setAttribute("aria-busy", String(busy));
      card.setAttribute(
        "aria-label",
        `${!readyIntent ? "Select" : busy ? "Preparing" : error ? "Retry" : "Play"} ${this.movies[index].title}`,
      );
      const action: HTMLElement =
        card.querySelector<HTMLElement>(".card-action")!;
      action.textContent = error ? "Retry" : "Play";
      const loading: HTMLElement =
        card.querySelector<HTMLElement>(".card-loading")!;
      loading.hidden = !readyIntent || !busy || !this.showPreparation;
    });
  }
}
