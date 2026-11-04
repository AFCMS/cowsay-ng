#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT

import cac from "cac";

import { printCow } from "./index";

const cli = cac();

cli.option("--type <type>", "Choose a project type", {
  default: "node",
});

const parsed = cli.parse();

console.log(JSON.stringify(parsed, null, 2));

printCow();
