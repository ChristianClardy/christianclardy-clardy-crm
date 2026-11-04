#!/usr/bin/env bash
# Build a throwaway database from the production public-schema snapshot,
# apply 062_employee_company_access.sql twice inside transactions, and check
# the access rules. Does not touch production.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${COMPANY_ACCESS_TEST_DB:-company_access_test}"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB};"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB};"
python3 scripts/replay_prod_schema.py | sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f -
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f scripts/test-company-access.sql
echo "company access test passed"
