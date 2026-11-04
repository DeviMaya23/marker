#!/usr/bin/env bash
# Run the Go integration tests against a throwaway local PostgreSQL, without Docker.
# For cloud sessions: uses the server binaries under /usr/lib/postgresql/<version>/bin
# and runs postgres as a non-root user (postgres refuses to run as root).
# Extra arguments are passed to `go test`. Where Docker is available use
# `make test-integration` instead (PostgreSQL 17, as in CI).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_USER=pgtest
DB_NAME=marker_test

BIN_DIR="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
if [ -z "$BIN_DIR" ] || [ ! -x "$BIN_DIR/initdb" ] || [ ! -x "$BIN_DIR/postgres" ]; then
  echo "error: no PostgreSQL server binaries found under /usr/lib/postgresql/*/bin." >&2
  echo "Use 'make test-integration' where Docker is available." >&2
  exit 1
fi
echo "Using PostgreSQL binaries in $BIN_DIR"

# Run a command as the non-root user (or directly, if we are not root).
if [ "$(id -u)" -eq 0 ]; then
  if ! id "$PG_USER" >/dev/null 2>&1; then
    useradd --system --create-home --shell /bin/bash "$PG_USER" \
      || { echo "error: could not create OS user $PG_USER" >&2; exit 1; }
  fi
  as_pg() { runuser -u "$PG_USER" -- "$@"; }
else
  PG_USER="$(id -un)"
  as_pg() { "$@"; }
fi

TMP_DIR="$(mktemp -d /tmp/marker-pg.XXXXXX)"
DATA_DIR="$TMP_DIR/data"
SOCK_DIR="$TMP_DIR/sock"
mkdir -p "$SOCK_DIR"
chown "$PG_USER" "$TMP_DIR" "$SOCK_DIR"
chmod 755 "$TMP_DIR"

STARTED=0
cleanup() {
  trap - EXIT INT TERM HUP
  if [ "$STARTED" -eq 1 ]; then
    as_pg "$BIN_DIR/pg_ctl" -D "$DATA_DIR" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

as_pg "$BIN_DIR/initdb" -D "$DATA_DIR" -U "$PG_USER" --auth=trust --encoding=UTF8 >"$TMP_DIR/initdb.log" 2>&1 \
  || { cat "$TMP_DIR/initdb.log" >&2; echo "error: initdb failed" >&2; exit 1; }

# Unix socket only (no TCP), in the temp directory. Port is irrelevant but fixed.
PORT=5432
if ! as_pg "$BIN_DIR/pg_ctl" -D "$DATA_DIR" -w -l "$TMP_DIR/postgres.log" \
  -o "-c listen_addresses='' -c unix_socket_directories='$SOCK_DIR' -c port=$PORT -c fsync=off" start >/dev/null; then
  cat "$TMP_DIR/postgres.log" >&2 || true
  echo "error: postgres failed to start" >&2
  exit 1
fi
STARTED=1

as_pg "$BIN_DIR/createdb" -h "$SOCK_DIR" -p "$PORT" -U "$PG_USER" "$DB_NAME"

export TEST_DATABASE_URL="postgres://$PG_USER@/$DB_NAME?host=$SOCK_DIR&port=$PORT&sslmode=disable"
echo "Postgres ready; running integration tests"

cd "$REPO_ROOT/backend"
rc=0
go test -tags integration ./... "$@" || rc=$?
exit "$rc"
