#!/usr/bin/sh

# Boot verification suite for the base image. Runs inside a running
# container as root via 'uv run invoke test-images'.

failed=""

run_check() {
  check_label="$1"
  check_func="$2"

  echo "Checking ${check_label}..."
  if "${check_func}"; then
    echo "Passed: ${check_label}."
  else
    echo "Failed: ${check_label}." 1>&2
    failed="true"
  fi
}

check_pid1_is_systemd() {
  attempts=0
  comm=""

  while [ "${attempts}" -lt 10 ]; do
    comm="$(cat /proc/1/comm 2>/dev/null)" || comm=""
    if [ "${comm}" = "systemd" ]; then
      return 0
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  echo "Expected PID 1 to be 'systemd' but found '${comm:-unknown}'." 1>&2
  return 1
}

check_system_running() {
  state="$(timeout 60 systemctl is-system-running --wait 2>/dev/null)" || true

  case "${state}" in
    running | degraded)
      return 0
      ;;
    *)
      echo "Expected system state 'running' or 'degraded' but got '${state:-none}'." 1>&2
      systemctl list-jobs --no-pager 1>&2 || true
      systemctl --failed --no-pager 1>&2 || true
      journalctl -b --no-pager -n 50 1>&2 || true
      return 1
      ;;
  esac
}

check_journal_queries() {
  journal_output="$(journalctl -b --no-pager -n 10 2>&1)" || {
    echo "journalctl failed to query the boot journal: ${journal_output}" 1>&2
    return 1
  }

  if [ -z "${journal_output}" ]; then
    echo "journalctl returned no output for the current boot." 1>&2
    return 1
  fi
}

check_unit_lifecycle() {
  unit_name="froazin-image-test.service"
  unit_file="/etc/systemd/system/${unit_name}"

  printf '%s\n' \
    "[Unit]" \
    "Description=froazin base image test unit" \
    "" \
    "[Service]" \
    "Type=oneshot" \
    "ExecStart=/usr/bin/true" \
    "RemainAfterExit=yes" \
    >"${unit_file}" || {
    echo "Failed to write ${unit_file}." 1>&2
    return 1
  }

  systemctl daemon-reload || {
    echo "systemctl daemon-reload failed." 1>&2
    return 1
  }

  systemctl start "${unit_name}" || {
    echo "Failed to start ${unit_name}." 1>&2
    journalctl -b --no-pager -u "${unit_name}" 1>&2 || true
    return 1
  }

  state="$(systemctl is-active "${unit_name}" 2>/dev/null)" || true
  if [ "${state}" != "active" ]; then
    echo "Expected ${unit_name} to be 'active' but got '${state:-unknown}'." 1>&2
    return 1
  fi
}

check_masked_units() {
  units="
  systemd-logind.service
  getty.target
  systemd-udevd.service
  "

  for unit in ${units}; do
    state="$(systemctl is-enabled "${unit}" 2>/dev/null)" || true
    if [ "${state}" != "masked" ]; then
      echo "Expected ${unit} to be 'masked' but got '${state:-unknown}'." 1>&2
      return 1
    fi
  done
}

run_check "PID 1 is systemd" check_pid1_is_systemd
run_check "system reaches running or degraded" check_system_running
run_check "journalctl answers queries" check_journal_queries
run_check "a unit can be started and observed active" check_unit_lifecycle
run_check "container-hostile units are masked" check_masked_units

if [ -n "${failed}" ]; then
  echo "One or more image checks failed." 1>&2
  exit 1
fi

echo "All image checks passed."
