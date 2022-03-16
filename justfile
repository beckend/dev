set shell := ["bash", "-c"]

DIR_CONTAINER_BASE := "./containers/ArchLinux/base"
NAME_TAG_CONTAINER_BASE := "dev-container-base"
USER_NAME := env_var('USER_NAME')

container-build_base:
  buildah bud \
    --squash \
    -t {{NAME_TAG_CONTAINER_BASE}} \
    -f {{DIR_CONTAINER_BASE}}/Containerfile \
    --build-arg=USER_NAME="{{USER_NAME}}" \
    {{DIR_CONTAINER_BASE}}
