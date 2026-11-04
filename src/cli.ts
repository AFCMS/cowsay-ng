#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT

import cac from "cac";

import { say } from "./index.ts";

const cli = cac();

const parsed = cli.parse();

console.log(parsed.options);

console.log(say({ cow: "hello world" }));
