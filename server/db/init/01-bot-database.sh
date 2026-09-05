#!/bin/sh
#
# Create the Discord bot's database and the account scoped to it.
#
# The database image runs everything in /docker-entrypoint-initdb.d once, on an
# empty data directory, and never again. That is the right moment for this and
# the wrong moment for anything else: creating a database and an account is the
# one thing no migration runner can do for itself, because it has to exist
# before there is anything to connect as. No table is created here. Every table
# on either database comes from a migration.
#
# A host whose database directory already has data never runs this file. The
# same statements are written out in docs/deployment.md to be run by hand
# there, once.
#
# The bot's account is granted everything inside its own database and nothing
# outside it. It reads and writes every piece of VIA data through the web
# platform's internal service API, so an account that could reach the web
# platform's tables would be a way around every authorization decision that API
# makes.
set -e

# Written as one if and no early exit on purpose. The database image executes
# this file when it is executable and reads it into its own shell when it is
# not, and an exit in the second case would stop the database starting rather
# than skip this script.
# All three values are pasted into the statements below, inside string quotes
# and inside identifier backticks. A single quote, a backtick or a backslash in
# any of them would close that quoting early and have the rest of the value read
# as SQL by an account that is root on this server. Escaping such a value
# correctly for both quotings is not worth attempting in a shell script that
# runs once, so a value carrying one of those characters is refused.
BOT_DB_VALUES_ARE_SAFE=yes
case "${BOT_DB_USER}:${BOT_DB_PASSWORD}:${BOT_DB_NAME}" in
  *\'*|*\`*|*\\*) BOT_DB_VALUES_ARE_SAFE=no ;;
esac

if [ -z "${BOT_DB_USER}" ] || [ -z "${BOT_DB_PASSWORD}" ] || [ -z "${BOT_DB_NAME}" ]; then
  echo "bot database: BOT_DB_USER, BOT_DB_PASSWORD or BOT_DB_NAME is unset, creating nothing"
elif [ "${BOT_DB_VALUES_ARE_SAFE}" = no ]; then
  echo "bot database: BOT_DB_USER, BOT_DB_PASSWORD or BOT_DB_NAME contains a single quote, a backtick or a backslash, so nothing was created. Choose values without those three characters, then start the database again on an empty data directory."
else
  echo "bot database: creating ${BOT_DB_NAME} and the account ${BOT_DB_USER}"

# The database name in a GRANT is a pattern, where an underscore matches any one
# character. Left unescaped, a grant on via_bot is also a grant on viaXbot, and
# any other stack on this shared host could create such a database and be handed
# the bot's account with it. The underscores and per cent signs are escaped here
# so that the grant names one database and no other.
BOT_DB_GRANT_PATTERN=$(printf '%s' "${BOT_DB_NAME}" | sed 's/[_%]/\\&/g')

# The temporary server of the initialisation phase listens on the socket only,
# which is why this connects over it rather than over TCP.
mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
CREATE DATABASE IF NOT EXISTS \`${BOT_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${BOT_DB_USER}'@'%' IDENTIFIED BY '${BOT_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${BOT_DB_GRANT_PATTERN}\`.* TO '${BOT_DB_USER}'@'%';
FLUSH PRIVILEGES;
EOSQL
fi
