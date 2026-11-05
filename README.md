# @afcms/cowsay-ng

A small ESM cowsay for Node.js 26 and modern browsers. The rendering code has no
runtime dependencies. Includes the 54 cows from the maintained
[cowsay-org implementation](https://github.com/cowsay-org/cowsay).

> [!WARNING]
> **Loading bundled cows in Node.js requires `--experimental-import-text`.**
> This applies to name-based loading, explicit cow module imports, and raw `.cow`
> imports. Start your application with `node --experimental-import-text app.mjs`.
> The installed CLI commands include the flag automatically in their shebangs.

```sh
pnpm add @afcms/cowsay-ng
pnpm exec cowsay-ng 'Hello world!'
pnpm exec cowthink-ng -f sheep 'Thinking…'
```

Use a Node 26 release supporting text modules (tested with 26.13.0).

Browsers and bundlers must support text modules using `with { type: "text" }`,
or provide an equivalent text-module adapter. No CommonJS build or Perl runtime
is required.

## Async API

```ts
import { say, think } from "@afcms/cowsay-ng";

console.log(await say("Hello!"));
console.log(await think("Hmm…", { cow: "sheep", mode: "tired" }));
```

Both functions return `Promise<string>` and use the default cow unless `cow` or
`random: true` is supplied. `cow` accepts a bundled name or compiled `Cow`;
it cannot be combined with `random`.

Use `loadCow(name)` to preload a cached cow, and `list()` for sorted, immutable
names without loading artwork. Names are case sensitive and omit `.cow`.

## Synchronous API

```ts
import { say } from "@afcms/cowsay-ng/core";
import sheep from "@afcms/cowsay-ng/cows/sheep";

console.log(say("Hello!", { cow: sheep }));
```

The core's `say` and `think` require a compiled cow and return a string without
loading or parsing. Explicit imports give the smallest total application bundle;
name-based loading makes the whole catalog reachable as lazy assets.

Raw sources are exported at `/cows/<name>.cow` for imports using
`with { type: "text" }`. Compile them with `compileCow(source, name?)` from `/core`.

## Render options

| Option               | Default | Meaning                                                                        |
| -------------------- | ------- | ------------------------------------------------------------------------------ |
| `eyes`               | `"oo"`  | First two Unicode code points                                                  |
| `tongue`             | `"  "`  | First two Unicode code points                                                  |
| `mode`               | unset   | `borg`, `dead`, `greedy`, `paranoid`, `stoned`, `tired`, `wired`, or `young`   |
| `wrapColumn`         | `40`    | Integer of at least two; uses Perl's `-W` column convention                    |
| `preserveWhitespace` | `false` | Preserve lines and spaces, expand tabs at eight-column stops, disable wrapping |

Text must be a string; empty strings are valid. Options use modern names; Perl's
short names are available on the CLI. Face modes override eyes; `dead` and
`stoned` also set the tongue to `"U "`. Other modes preserve a custom tongue,
matching the implementation where the upstream manual differs.

Default layout follows `Text::Wrap::fill`: ordinary newlines become spaces;
a newline followed by whitespace starts a paragraph. Paragraphs have a blank line
between them. The wrap limit is `wrapColumn - 1`; reference trailing-whitespace
boundary behavior is retained. Balloon padding, borders, artwork, and final
newlines match the pinned reference. API strings are used as supplied; the CLI
handles stdin record separators before rendering.

Printable ASCII takes a direct path. Unicode input lazily initializes one
`Intl.Segmenter`; graphemes stay intact across wraps. Checked-in Unicode 17.0
tables treat CJK/fullwidth characters and emoji as terminal width two, ambiguous
characters as narrow, and combining marks as zero width. A grapheme wider than
the requested wrap limit occupies its own line. Terminal/font rendering can vary.

SGR styles and OSC 8 hyperlinks have zero width. They are kept intact and closed
before balloon padding and borders, then restored inside the next row. Cursor
movement and other terminal-control protocols are outside the layout contract.

## CLI compatibility and discovery

```sh
cowsay-ng [-bdgpstwy] [-e eyes] [-T tongue] [-f cowfile] [-W columns]
          [-n] [-r [-C]] [--] [message ...]
cowsay-ng -l
cowsay-ng --help
cowsay-ng --version
```

Grouped flags and attached values work, for example `-bd`, `-e^^`, and `-W20`.
Parsing stops at the first message argument; later arguments are literal message
text. `--` also ends option parsing. Arguments are joined with spaces and stdin
is ignored. Otherwise stdin is read through EOF, with one final newline removed
as in Perl's per-record `chomp`. `-n` requires stdin input. Mood flags use the fixed
precedence `b`, `d`, `g`, `p`, `s`, `t`, `w`, `y`, retaining earlier tongue overrides.

`-f` first accepts an existing file. Otherwise it searches each cow directory for
the exact name, then the name with `.cow` appended. Discovery is recursive, with
relative names such as `truecolor/example`. The first directory containing a name
wins. Random selection discovers names without compiling candidates, and excludes
`truecolor/` unless `-C` is given. `-r` takes precedence over `-f`, as in Perl.

The published `dist` directory is the installation prefix. Search order is:

1. `dist/share/cowsay/site-cows`
2. `dist/share/cowsay/cows`
3. Directories listed one per line in `dist/etc/cowsay/cowpath.d/*.path`
4. Directories in `COWPATH`, separated by the platform's path delimiter

This order follows upstream's implementation; its manual reverses the default
and user paths. With nonempty `COWPATH` and `COWSAY_ONLY_COWPATH=1`, only the user
paths are searched. Duplicate directories are removed while retaining order.
Configuration files are read in filename order. The reference's `/usr` prefix
special case uses `/etc/cowsay/cowpath.d`.

`-l` prints sorted, unique names when piped, and grouped, wrapped directory lists
on a terminal. It discovers names without parsing cows. Help and version perform
no stdin reads, artwork imports, or directory scans. Errors go to stderr without
stacks; broken output pipes exit cleanly.

## Safe custom cowfiles

`compileCow(source, name?)` accepts a deliberately small Perl template subset:
bare and double-quoted interpolating heredocs, single-quoted literal heredocs,
`$thoughts`, `$eyes`, `$tongue` and their braced forms, escaped backslashes,
dollars and at-signs, standard control escapes, and numeric escapes. It recognizes
the exact face preludes used by `small`, `sus`, `three-eyes`, and `udder`.
The bundled `chami` typo `$eye` and `bill`'s empty `@+` interpolation are preserved.

Other executable statements, unsupported interpolation, and unsupported escapes
raise errors containing the source name, line, and column. Templates are never
evaluated as code. No `eval`, `Function`, or Perl subprocess is used by the package.

## Development

Use Node.js 26 and pnpm.

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:package
```

Builds and tests use checked-in data and need no downloads or Perl.
Regenerate cow modules with `pnpm cows:generate`; use `pnpm cows:download` to
refresh the [pinned artwork snapshot](./scripts/cows-snapshot.json).
`pnpm unicode:generate` refreshes width tables, and `pnpm fixtures:generate`
refreshes reference fixtures (requires Perl and `Text::Wrap`).

## Cow artwork

The beautiful cows in [src/cows](./src/cows) come from
[cowsay-org/cowsay](https://github.com/cowsay-org/cowsay).

The cowsay-ng source code is [MIT-licensed](./LICENSE). The bundled cow artwork
retains its upstream licensing, including GPL-3.0-only for `sus.cow`; see the
[artwork attribution](./src/cows/ATTRIBUTION.md) for the complete notices and credits.
