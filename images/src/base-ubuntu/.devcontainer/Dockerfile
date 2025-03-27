ARG VARIANT="noble"
FROM buildpack-deps:${VARIANT}-curl

ARG VARIANT
LABEL org.opencontainers.image.source='https://github.com/froazin/devcontainers'
LABEL org.opencontainers.image.url='https://github.com/froazin/devcontainer-images/ubuntu'
LABEL org.opencontainers.image.vendor='@froazin'
LABEL org.opencontainers.image.title="Ubuntu (${VARIANT}) Base Image"
LABEL org.opencontainers.image.description='An Ubuntu base image for devcontainers.'
LABEL org.opencontainers.image.documentation='https://github.com/froazin/devcontainers/src/images/ubuntu/README.md'

COPY ./image /tmp/devcontainer
RUN chmod +x /tmp/devcontainer/install.sh && /tmp/devcontainer/install.sh
