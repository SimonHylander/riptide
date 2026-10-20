#!/usr/bin/env bash
# Dumps the files the Linux and nvidia-smi adapters read into a fixture directory,
# in the layout test/fixtures/<host>/ expects. Run it on the Linux host to capture:
#   scripts/capture-fixtures.sh test/fixtures/<host>
set -euo pipefail

out=${1:?usage: capture-fixtures.sh <fixture-dir>}
mkdir -p "$out/proc/sys/kernel" "$out/sys/class/hwmon"

for f in stat meminfo loadavg uptime mounts; do cat "/proc/$f" > "$out/proc/$f"; done
cat /proc/sys/kernel/hostname > "$out/proc/sys/kernel/hostname"
# A second /proc/stat one second later, for CPU delta tests.
sleep 1
cat /proc/stat > "$out/proc/stat.next"

# hwmon: only the files the adapter reads. Unreadable sensors (EIO, ENODATA) are left out.
for chip in /sys/class/hwmon/hwmon*; do
  [ -e "$chip" ] || continue
  dest="$out/sys/class/hwmon/$(basename "$chip")"
  mkdir -p "$dest"
  for f in "$chip"/name "$chip"/temp*_input "$chip"/temp*_label "$chip"/fan*_input "$chip"/fan*_label; do
    [ -f "$f" ] || continue
    cat "$f" > "$dest/$(basename "$f")" 2>/dev/null || rm -f "$dest/$(basename "$f")"
  done
done
# Keeps an empty hwmon dir (a host without sensors) in git.
touch "$out/sys/class/hwmon/.gitkeep"

# statfs.json: total and used bytes (as df computes them) of every sized mount.
{
  echo "{"
  sep=""
  while read -r _ raw _; do
    mount=$(printf '%b' "$raw")
    sizes=$(stat -f -c '%S %b %f' "$mount" 2>/dev/null) || continue
    read -r bsize blocks bfree <<< "$sizes"
    [ "$blocks" -gt 0 ] || continue
    key=$(printf '%s' "$mount" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '%s  "%s": { "totalBytes": %d, "usedBytes": %d }' "$sep" "$key" \
      $((blocks * bsize)) $(((blocks - bfree) * bsize))
    sep=$',\n'
  done < /proc/mounts
  printf '\n}\n'
} > "$out/statfs.json"

# nvidia-smi.csv: a few rounds of the adapter's query, when an NVIDIA GPU is present.
if command -v nvidia-smi > /dev/null && nvidia-smi -L > /dev/null 2>&1; then
  timeout 3.5 nvidia-smi \
    --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw \
    --format=csv,noheader,nounits -lms 1000 > "$out/nvidia-smi.csv" || true
fi

echo "captured $(cat /proc/sys/kernel/hostname) into $out"
