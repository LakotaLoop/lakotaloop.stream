/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import "./styles.css";

import { launchApp } from "./app/launchApp";
// This entry deliberately does not accept hot module replacement. Vite reloads
// the document for controller changes, preventing two owners of a native video.
launchApp();
