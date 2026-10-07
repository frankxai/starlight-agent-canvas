# Production MCP directory

This rail produces a platform-specific production directory for the existing
Canvas MCP server. The web interface is delivered through its existing build
path. Canvas runtime data stays in `AGENT_CANVAS_HOME` outside the package.

Use the directory to pin a task-scoped native client to reviewed source without
changing another owner's development checkout. The base Canvas registration
stays disabled. Packaging does not exercise native Codex activation or establish
the wider founder/customer outcome.

## Build and proof

After machine/storage admission and the applicable estate security intake, use a
clean, committed source checkout, pinned pnpm 11.7.0 and Node 24:

```text
pnpm install --frozen-lockfile
pnpm mcp:package <new absolute output directory outside this checkout>
```

The parent directory must exist. The command refuses an existing output. Failed
outputs and their private temporary diagnostics are preserved for inspection;
choose a new output for a retry. Do not use an incomplete output as a runtime.

The command rebuilds MCP/core from the committed source. It refuses stale or
unexpected output filenames and compares each built guide with its source.
The package uses production-only, offline, script-free `pnpm deploy` with its
shared-lock path, an invocation-scoped injection flag and the hoisted linker.
This reuses pnpm's dependency layout and creates regular
files suitable for Windows artifact delivery. Manager state and bin shims are
excluded; launch the explicit Node entry point. There is no new bundler or
dependency. Actual
package versions, dependency/peer edges and optional availability must match the
frozen source graph. A mismatch fails packaging. The first attempted legacy rail
failed because it selected a newer uncached Zod release; that failure is retained.
The production manifest omits temporary deploy lock/config files and uses exact
dependency versions without absolute workspace paths. Dependency content
integrity relies on pnpm's frozen/offline store verification. File hashes bind
the resulting artifact; they do not independently rebuild third-party tarballs,
validate publisher signatures or prove lifecycle-generated native files.
The deployment command explicitly shares the source's populated store. Windows
chooses a default store per drive; using a temporary directory on C: after a
source install on D: would otherwise select an empty store. This invocation-only
setting preserves offline behavior without changing global configuration.

The server reads eleven guide resources inside its own built package. Compiled
MCP/core bytes are compared with the source build. The command copies its output
to a receiving directory outside the checkout and exercises ingestion, local
actions, export, checkpoint comparison, website planning and all guide reads
through real MCP stdio. These are deterministic synthetic smoke inputs; they do
not measure customer demand or a real creation-task benchmark. PDF intake in the
existing smoke uses an invalid fixture and does not prove successful PDF text
extraction.

CI repeats this on Windows and Linux with Node 24. It uploads the verified
directory, downloads that actual artifact, checks its files against the
pre-upload receipt and repeats the receiving-side MCP smoke. Existing Node
22.13/24 source matrices retain their normal checks. Artifacts are temporary CI
deliveries, not npm releases or globally installed runtimes.

## Verify before adoption

Select a successful run from the authenticated canonical repository and verify
its exact commit, independent review and applicable release gates. Retain its
manifest SHA256 from the packaging receipt separately from the downloaded
artifact. Download the artifact for the receiving platform and architecture;
do not substitute Linux native dependencies on Windows.

Using the trusted integrity script from that reviewed source:

```text
node scripts/runtime-integrity.mjs <received directory> <exact source commit> <trusted manifest SHA256>
```

The manifest identifies the repository, source commit/tree, source lock digest,
platform/architecture, build tools, production dependency graph and each file's
size/hash. Verification rejects altered, missing, extra, linked and nonportable
file entries, mismatched identities and dependency graph changes. Hashes provide
integrity against the independently retained receipt; they are not a publisher
signature or proof that arbitrary source is trustworthy. Do not execute a
verifier supplied by an untrusted download before validating its provenance.

After verification, a task-scoped client can launch:

```text
<absolute Node executable> <pinned directory>/dist/cli.js
```

Set `AGENT_CANVAS_HOME` explicitly to the intended existing data directory.
Keep that home stable across upgrades and preserve the previous runtime and
native settings for rollback. MCP discovery, native approval/disabled-tool
behavior and actual installed source identity require their own admitted proof.
Never start every configured server to obtain one Canvas check. This slice does
not change any real native configuration.

The local filesystem and concurrent writers remain an owner trust boundary.
Enumeration is bounded to 50,000 files, 1 GiB and a limited directory depth.
Verification is a point-in-time check, not a filesystem lock or hostile-writer
defense. Normal completion removes only this invocation's verified private
temporary directory; failures retain evidence. Dependency licenses remain in
the production tree, with the Canvas MIT notices included in both packages.
Missing manifests mark incomplete outputs; any failed verification disqualifies
the output. A busy private-directory cleanup is reported separately after
successful runtime verification. Only that exact retained directory is eligible
for later owner cleanup. Node/pnpm versions are recorded build evidence;
verification checks platform/architecture, without asserting Linux libc,
arbitrary Node version, extractor MAX_PATH or successful optional-native-module
compatibility. The verified receiving matrix is Windows/Linux with Node 24.

Official references: [pnpm deploy](https://pnpm.io/cli/deploy),
[hoisted linker](https://pnpm.io/settings/node-modules#nodelinker), and
[GitHub artifact behavior](https://github.com/actions/upload-artifact).
Current pnpm documentation describes newer releases; this rail stays on the
repository's 11.7.0 and proves its actual deployed behavior in CI.
