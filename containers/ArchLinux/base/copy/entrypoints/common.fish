function linkUserHost
  set -l DIR_TARGET_LINK_SOURCE /home/host

  if test -d $DIR_TARGET_LINK_SOURCE && test -r $DIR_TARGET_LINK_SOURCE
    set -l TARGETS_TO_LINK '.npmrc' '.ssh' '.gnupg' '.netrc' '.gitconfig'

    for x in $TARGETS_TO_LINK
      set -l PATH_FULL "$DIR_TARGET_LINK_SOURCE/$x"

      if test -r "$PATH_FULL"
        ln -sf "$PATH_FULL" "$HOME/$x"
      end
    end
  end
end

function executeUserInits
  set -l DIR_TARGET_USER_INITS '/home/host/.config/devcontainers/init'

  if test -d $DIR_TARGET_USER_INITS && test -r $DIR_TARGET_USER_INITS
    for x in $DIR_TARGET_USER_INITS/*
      if test -s $x && test -x $x
        . "$x"
      end
    end
  end
end

function finishInit
  echo Init (set_color green)complete(set_color normal)!
  linkUserHost
  executeUserInits

  cd $HOME
  date
  exec fish
end

function setupASDFTool
  set -l NAME_PLUGIN $argv[1]
  set -l NAME_VERSION $argv[2]

  asdf plugin add $NAME_PLUGIN 2>/dev/null || true
  asdf install $NAME_PLUGIN $NAME_VERSION
  asdf global $NAME_PLUGIN $NAME_VERSION
end
