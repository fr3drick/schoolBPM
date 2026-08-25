#!/usr/bin/env bash
# Copy the production database into the test environment.
#
# Test is used by real staff, so user emails and password hashes are copied
# as-is: people sign in with the credentials they already have, and email
# reaches them. Test mail is distinguishable from production by its sender
# name ("... (TEST)") and by deep links pointing at test.idverge.com.ng.
#
# Three collections are deliberately NOT copied:
#   emailoutboxes  production's queued mail. Restoring it would let the test
#                  mail worker claim those rows and send them for real, a
#                  second time, from the wrong environment.
#   passwordresets live reset tokens whose links point at production.
#   schoolsignups  in-flight registrations with OTP state.
# Whatever test already holds in those three is dropped, so the result is a
# clean mirror rather than a merge.
#
# Usage: ./sync-prod-to-test.sh [--yes]
set -euo pipefail

PROD_HOST="${SCHOOLBPM_HOST:-ubuntu@150.230.125.111}"
PROD_DB="${SCHOOLBPM_PROD_DB:-schoolbpm}"
TEST_HOST="${SCHOOLBPM_TEST_HOST:-ubuntu@140.238.65.145}"
TEST_DB="${SCHOOLBPM_TEST_DB:-schoolbpm_test}"
TEST_SERVICE="${SCHOOLBPM_TEST_SERVICE:-schoolbpm-test}"
SKIP=(emailoutboxes passwordresets schoolsignups)

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="/tmp/schoolbpm-$STAMP.archive"
LOCAL_ARCHIVE="$(mktemp -t schoolbpm-sync).archive"

# --- guards ---------------------------------------------------------------
# This script drops the target database. Everything below exists so that a
# transposed argument cannot point that at production.
[ "$PROD_HOST" != "$TEST_HOST" ] || { echo "Refusing: source and target hosts are identical." >&2; exit 1; }
case "$TEST_DB" in
  *test*) ;;
  *) echo "Refusing: target database '$TEST_DB' is not named as a test database." >&2; exit 1 ;;
esac

cleanup() {
  # The archive is real user data; do not leave it lying around on either box.
  rm -f "$LOCAL_ARCHIVE"
  ssh "$PROD_HOST" "rm -f '$ARCHIVE'" 2>/dev/null || true
  ssh "$TEST_HOST" "rm -f '$ARCHIVE'" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Checking both ends"
PROD_VER=$(ssh "$PROD_HOST" "mongod --version | head -1 | sed 's/db version v//'")
TEST_VER=$(ssh "$TEST_HOST" "mongod --version | head -1 | sed 's/db version v//'")
echo "    prod mongod $PROD_VER  ->  test mongod $TEST_VER"
if [ "${PROD_VER%%.*}" -gt "${TEST_VER%%.*}" ]; then
  echo "    WARNING: restoring a newer dump into an older server is unsupported."
  echo "             Upgrade the test box to MongoDB ${PROD_VER%%.*} to match production."
fi

if [ "${1:-}" != "--yes" ]; then
  echo
  echo "This DROPS $TEST_DB on $TEST_HOST and replaces it with production data."
  read -r -p "Type the target database name to continue: " CONFIRM
  [ "$CONFIRM" = "$TEST_DB" ] || { echo "Aborted."; exit 1; }
fi

# --- dump -----------------------------------------------------------------
echo "==> Dumping $PROD_DB on production"
EXCLUDES=""
for c in "${SKIP[@]}"; do EXCLUDES="$EXCLUDES --excludeCollection=$c"; done
ssh "$PROD_HOST" "mongodump --db='$PROD_DB' --archive='$ARCHIVE' --gzip $EXCLUDES --quiet"
ssh "$PROD_HOST" "ls -lh '$ARCHIVE' | awk '{print \"    archive: \" \$5}'"

echo "==> Transferring"
scp -q "$PROD_HOST:$ARCHIVE" "$LOCAL_ARCHIVE"
scp -q "$LOCAL_ARCHIVE" "$TEST_HOST:$ARCHIVE"

# --- restore --------------------------------------------------------------
# The app is stopped so it cannot read a half-restored database, and so the
# mail worker is not polling while collections are being swapped underneath it.
echo "==> Stopping $TEST_SERVICE"
ssh "$TEST_HOST" "sudo systemctl stop '$TEST_SERVICE'"

echo "==> Restoring into $TEST_DB"
ssh "$TEST_HOST" "mongorestore --archive='$ARCHIVE' --gzip --drop \
  --nsFrom='$PROD_DB.*' --nsTo='$TEST_DB.*' --quiet"

# --drop only clears collections present in the archive, so the three we
# skipped would otherwise keep whatever test had in them.
echo "==> Clearing skipped collections on test"
for c in "${SKIP[@]}"; do
  ssh "$TEST_HOST" "mongosh '$TEST_DB' --quiet --eval 'db.$c.drop()'" >/dev/null 2>&1 || true
done

echo "==> Starting $TEST_SERVICE"
ssh "$TEST_HOST" "sudo systemctl start '$TEST_SERVICE'"

# --- verify ---------------------------------------------------------------
echo "==> Verifying"
ssh "$TEST_HOST" "mongosh '$TEST_DB' --quiet --eval '
  const names = db.getCollectionNames().sort();
  names.forEach(function (n) { print(\"    \" + n + \": \" + db.getCollection(n).countDocuments()); });
  const leaked = db.emailoutboxes ? db.emailoutboxes.countDocuments() : 0;
  print(leaked === 0 ? \"    outbox clean: no production mail was copied\"
                     : \"    WARNING: outbox has \" + leaked + \" rows\");
'"

sleep 4
ssh "$TEST_HOST" "curl -fsS http://127.0.0.1:4100/api/health" && echo
echo
echo "Synced. Sign in at https://test.idverge.com.ng with production credentials."
