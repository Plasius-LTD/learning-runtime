#!/usr/bin/env bash

set -euo pipefail

readonly GH_CLI_VERSION="2.96.0"
readonly GH_CLI_SHA256="83d5c2ccad5498f58bf6368acb1ab32588cf43ab3a4b1c301bf36328b1c8bd60"
readonly GH_CLI_ARCHIVE="gh_${GH_CLI_VERSION}_linux_amd64.tar.gz"
readonly GH_CLI_DIRECTORY="gh_${GH_CLI_VERSION}_linux_amd64"
readonly INSTALL_ROOT="${RUNNER_TEMP:?RUNNER_TEMP is required}/github-cli-${GH_CLI_VERSION}"
readonly ARCHIVE_PATH="${INSTALL_ROOT}/${GH_CLI_ARCHIVE}"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  printf 'Pinned GitHub CLI installer requires a Linux X64 runner.\n' >&2
  exit 1
fi

mkdir -p "${INSTALL_ROOT}"

curl \
  --proto '=https' \
  --tlsv1.2 \
  --fail \
  --silent \
  --show-error \
  --location \
  --output "${ARCHIVE_PATH}" \
  "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/${GH_CLI_ARCHIVE}"

(
  cd "${INSTALL_ROOT}"
  actual_sha256="$(sha256sum "${GH_CLI_ARCHIVE}" | awk '{print $1}')"
  if [[ "${actual_sha256}" != "${GH_CLI_SHA256}" ]]; then
    printf 'GitHub CLI checksum mismatch: expected %s, received %s\n' \
      "${GH_CLI_SHA256}" "${actual_sha256}" >&2
    exit 1
  fi
  tar --extract --gzip --file "${GH_CLI_ARCHIVE}"
)

printf '%s\n' "${INSTALL_ROOT}/${GH_CLI_DIRECTORY}/bin" >> \
  "${GITHUB_PATH:?GITHUB_PATH is required}"

"${INSTALL_ROOT}/${GH_CLI_DIRECTORY}/bin/gh" --version
