ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# Ubuntu's image ships an ubuntu user with UID and GID 1000, which a dev container's own user would clash with.
# userdel -r also removes its group, home, mail spool, group memberships and subordinate IDs.
RUN userdel --remove ubuntu

# systemd runs as PID 1, as in an init image. systemd reads container from PID 1's environment to know it's in one.
ENV container=oci

# The masked units manage hardware, consoles and logins, which a container doesn't have, and fail or hang without them.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends dbus procps systemd systemd-sysv \
    && rm -rf /var/lib/apt/lists/* \
    && systemctl mask \
        console-getty.service \
        dev-hugepages.mount \
        getty.target \
        sys-fs-fuse-connections.mount \
        systemd-logind.service \
        systemd-machine-id-commit.service \
        systemd-random-seed.service \
        systemd-remount-fs.service \
        systemd-udev-trigger.service \
        systemd-udevd.service \
    && systemctl set-default multi-user.target

COPY --chmod=755 devcontainer-init.sh /usr/local/sbin/devcontainer-init

# systemd treats SIGTERM as a request to re-execute itself, and shuts down cleanly on SIGRTMIN+3.
STOPSIGNAL SIGRTMIN+3
CMD ["/usr/local/sbin/devcontainer-init"]

ARG IMAGE_VERSION
ARG IMAGE_TITLE
ARG IMAGE_DESCRIPTION
ARG IMAGE_SOURCE
# podman's layer cache keys RUN on the build arguments, but not LABEL, so this makes a changed label value rebuild.
RUN true
LABEL org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.title="${IMAGE_TITLE}" \
      org.opencontainers.image.description="${IMAGE_DESCRIPTION}" \
      org.opencontainers.image.source="${IMAGE_SOURCE}"
