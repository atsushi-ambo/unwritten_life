#!/usr/bin/env bash
set -euo pipefail
# Immutable official Linux x64 release, verified before execution.
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]]
install_dir="${RUNNER_TEMP:?GitHub runner required}/unwritten-gitleaks"
mkdir -p "$install_dir"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --max-time 60 --output "$install_dir/release.tar.gz" \
  https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
printf '%s  %s\n' '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb' "$install_dir/release.tar.gz" | sha256sum --check --status
tar -xzf "$install_dir/release.tar.gz" -C "$install_dir" gitleaks
printf '%s\n' "$install_dir" >> "${GITHUB_PATH:?}"
