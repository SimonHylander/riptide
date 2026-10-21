# Fixture hosts

Each directory is one host as the Linux and `nvidia-smi` adapters see it:

- `proc/{stat,meminfo,loadavg,uptime,mounts}` and `proc/sys/kernel/hostname`
- `proc/stat.next`: `/proc/stat` one second after `proc/stat`, for CPU delta tests
- `sys/class/hwmon/hwmonN/{name,temp*_input,temp*_label,fan*_input,fan*_label}`
- `sys/class/hwmon/hwmonN/device`: a symlink whose target's basename names the chip's
  parent device, as in sysfs. The target does not exist in the fixture tree.
- `statfs.json`: `{ totalBytes, usedBytes }` per mount, standing in for `statfs(2)`
- `nvidia-smi.csv`: output of the adapter's `nvidia-smi --query-gpu` loop (GPU hosts only)

Hosts:

- `desktop`: 16 logical CPUs, k10temp, two NVMe drives, an amdgpu iGPU, a Wi-Fi chip
  and an nct6798 Super I/O with stopped fans, one NVIDIA GPU, bind mounts, tmpfs,
  overlay and squashfs entries.
- `vm`: 2 vCPUs with steal time, no hwmon chips, no fans, no GPU, no swap.

These were written by hand from the kernel formats. Replace them with real captures
by running `scripts/capture-fixtures.sh test/fixtures/<host>` on a Linux host, then
update the expected values in the tests.
