// noinspection JSUnusedGlobalSymbols

import { AsyncConstructor } from 'https://cdn.skypack.dev/async-constructor@v0.4.14'
import { join } from 'https://deno.land/std@0.129.0/path/mod.ts'
import { Exec } from 'https://raw.githubusercontent.com/beckend/deno-applications/main/src/modules/exec/mod.ts'
import {
  ShellUtilities,
  IOutputMode,
} from 'https://raw.githubusercontent.com/beckend/deno-applications/main/src/modules/shell-command/shell-utilities.ts'
import {
  FileHandler,
} from 'https://raw.githubusercontent.com/beckend/deno-applications/main/src/modules/file-handler/mod.ts'
import { EOL } from 'https://deno.land/std@0.129.0/fs/eol.ts'
import {
  Logger,
  Level as LoggerLevel,
  LoggerOpticExtended,
  colors,
} from 'https://raw.githubusercontent.com/beckend/deno-applications/main/src/modules/logger/mod.ts'
import dedent from 'https://raw.githubusercontent.com/tamino-martinius/node-ts-dedent/v2.1.1/src/index.ts'

export interface ICommandCommonOptions {
  readonly user: {
    readonly name: string
  }
}

export class Script extends AsyncConstructor {
  static defaults = {
    commands: {
      pacman: 'pacman -q --needed --noconfirm',
      aur: 'paru -q --skipreview --needed --noconfirm',
    },
    dirName: new URL('.', import.meta.url).pathname.slice(0, -1),
  }

  static instances = {
    fileHandler: new FileHandler(),
  }

  static getters = {
    async latestVersionFromGithub<T1 extends {
      readonly nameRepository: string
    }>({ nameRepository }: T1) {
      const response = await fetch(
        `https://api.github.com/repos/${nameRepository}/releases/latest`,
      )
      const tagName = (await response.json()).tag_name as string

      return { tagName }
    },

    async machineHardwareName(): Promise<string> {
      const {
        outputs: { stdOut },
      } = await Exec.API.exec({
        getCommand: () => 'uname -m',
        throwOnCommandError: true,
        modeOutput: IOutputMode.Capture,
      })

      return stdOut
    },
  }

  logger!: LoggerOpticExtended

  utilities = {
    installAURPackage: async <T1 extends {
      readonly namePackage: string
      readonly uriGIT: string
    }>({
      namePackage,
      uriGIT,
    }: T1) => {
      const dirWork = `/tmp/install-aur-${namePackage}`
      const logger = await this.logger.withFields({
        task: `install-aur-${namePackage}`,
      })

      logger.info('start')

      return Exec.API.exec({
        getCommand: () =>
          [
            `runuser -l ${this.options.user.name} -s /bin/sh -c '`,
            [
              `git clone ${uriGIT} ${dirWork}`,
              `cd ${dirWork}`,
              'makepkg -si --noconfirm',
              `rm -rf ${dirWork}`,
            ].join(' && '),
            '\'',
          ].join(''),
        withShell: true,
        throwOnCommandError: true,
        modeOutput: IOutputMode.StdOutErr,
      }).then(() => {
        logger.info(colors.green('success'))
      })
    },

    installPackagesUsingAUR: <T1 extends {
      readonly packages: Array<string>
    }>({
      packages,
    }: T1) =>
      Exec.API.exec({
        getCommand: () =>
          [
            `runuser -l ${this.options.user.name} -s /bin/sh -c '`,
            `${Script.defaults.commands.aur} -S `,
            packages.join(' '),
            '\'',
          ].join(''),
        withShell: true,
        throwOnCommandError: true,
        modeOutput: IOutputMode.StdOutErr,
      }),
  }

  options!: ICommandCommonOptions

  tasks = {
    checks: () => {
      return Promise.all([ShellUtilities.API.checks.requireRoot()])
    },

    adjustMakeConf: () =>
      Script.instances.fileHandler.API.modifyFile({
        onContents: ({ contents, onFileContentsLineByLine }) =>
          onFileContentsLineByLine({
            contents,
            onContentsLine: [
              (line) => {
                if (line.startsWith('MAKEFLAGS=')) {
                  return 'MAKEFLAGS="-j16"'
                }
              },
            ],
          }),
        pathFile: '/etc/makepkg.conf',
      }),

    installAUR: () =>
      this.utilities
        .installAURPackage({
          namePackage: 'paru',
          uriGIT: 'https://aur.archlinux.org/paru-bin.git',
        })
        .then(() =>
          Exec.API.exec({
            getCommand: () => '/usr/bin/paru --gendb',
            withShell: true,
            throwOnCommandError: true,
            modeOutput: IOutputMode.StdOutErr,
          }),
        ),

    addUser: async () => {
      const stateThis = {
        user: {
          UID: 1000,
          GID: 1000,
        },
      }

      await Promise.all([
        Exec.API.execMulti({
          getCommands: () => [
            `groupadd --gid ${stateThis.user.GID} ${this.options.user.name}`,
            `useradd ${[
              `--uid ${stateThis.user.UID}`,
              `--gid ${stateThis.user.GID}`,
              `-m ${this.options.user.name}`,
              '-G wheel,users',
              '-s /usr/bin/fish',
            ].join(' ')}`,

            // root
            'chsh -s /bin/fish',
          ],
          throwOnCommandError: true,
          modeOutput: IOutputMode.StdOutErr,
        }),

        Script.instances.fileHandler.API.writeFile({
          contentFile: '%wheel ALL=(ALL) NOPASSWD: ALL' + EOL.LF,
          pathFile: '/etc/sudoers.d/10-wheel',
          overwriteFile: true,
        }),
      ])
    },

    handleLocale: ({
      CMDLocaleGen,
      pathDirETC,
    }: {
      CMDLocaleGen: string
      readonly pathDirETC: string
    }) => {
      return Promise.all([
        Script.instances.fileHandler.API.writeFile({
          contentFile:
            [
              'en_US.UTF-8 UTF-8',
              // somehow this is gone after glibc stuff
              // 'sv_SE.UTF-8 UTF-8'
            ].join(EOL.LF) + EOL.LF,
          pathFile: join(pathDirETC, 'locale.gen'),
          overwriteFile: true,
        }).then(() =>
          Exec.API.exec({
            getCommand: () => CMDLocaleGen,
            throwOnCommandError: true,
            modeOutput: IOutputMode.StdOutErr,
          }),
        ),

        Script.instances.fileHandler.API.writeFile({
          contentFile: 'LANG=en_US.UTF-8' + EOL.LF,
          pathFile: join(pathDirETC, 'locale.conf'),
          overwriteFile: true,
        }),

        Script.instances.fileHandler.API.writeFile({
          contentFile: 'KEYMAP=us' + EOL.LF,
          pathFile: join(pathDirETC, 'vconsole.conf'),
          overwriteFile: true,
        }),
      ])
    },

    writeMirrorList: async ({ pathFile }: { readonly pathFile: string }) => {
      const logger = await this.logger.withFields({
        task: 'write-mirrorlist',
      })

      return Script.instances.fileHandler.API.writeFile({
        contentFile:
          [
            // # With:       reflector --latest 200 --protocol https --country Norway --country Sweden --country Finland --country Denmark --age 12 --sort rate
            // # When:       2022-03-16 20:32:29 UTC
            // # From:       https://archlinux.org/mirrors/status/json/
            //     # Retrieved:  2022-03-16 20:32:24 UTC
            // # Last Check: 2022-03-16 20:26:23 UTC
            //
            'https://mirror.one.com/archlinux/$repo/os/$arch',
            'https://mirror.osbeck.com/archlinux/$repo/os/$arch',
            'https://mirror.safe-con.dk/archlinux/$repo/os/$arch',
            'https://mirror.neuf.no/archlinux/$repo/os/$arch',
            'https://mirror.wuki.li/archlinux/$repo/os/$arch',
            'https://arch.yhtez.xyz/$repo/os/$arch',
            'https://mirror.archlinux.no/$repo/os/$arch',
            'https://mirror.srv.fail/archlinux/$repo/os/$arch',
            'https://ftp.myrveln.se/pub/linux/archlinux/$repo/os/$arch',
            'https://mirrors.dotsrc.org/archlinux/$repo/os/$arch',
            'https://ftp.acc.umu.se/mirror/archlinux/$repo/os/$arch',
            'https://lysakermoen.com/Software/Linux/Mirrors/ArchLinux/$repo/os/$arch',
          ]
            .map((x) => `Server = ${x}`)
            .join(EOL.LF) + EOL.LF,
        pathFile,
        overwriteFile: true,
      }).then(() => {
        logger.info(colors.green('success'))
      })
    },

    writePacmanConf: async ({ pathFile }: { readonly pathFile: string }) => {
      const logger = await this.logger.withFields({
        task: 'writePacmanConf',
      })

      await Script.instances.fileHandler.API.modifyFile({
        onContents: ({ contents }) => {
          if (contents.includes('ParallelDownloads')) {
            return contents
              .replace('#Color', 'Color')
              .replace(/#ParallelDownloads.+/g, 'ParallelDownloads = 9')
              .replace(/#CacheDir.+/g, 'CacheDir = /tmp/cache-pacman/pkg')
          }

          return contents.replace(
            '#Color',
            'Color' + EOL.LF + 'ParallelDownloads = 9' + EOL.LF,
          )
        },
        pathFile,
      })

      logger.info(colors.green('success'))
    },

    pacCache: () =>
      Script.instances.fileHandler.API.writeFile({
        contentFile: dedent`
          [Trigger]
          Operation = Remove
          Operation = Install
          Operation = Upgrade
          Type = Package
          Target = *

          [Action]
          Description = Removing unnecessary cached files
          When = PostTransaction
          Exec = /usr/bin/paccache -rvk0`,
        pathFile: '/etc/pacman.d/hooks/0200-pacman-cache-cleanup.hook',
      }),

    packagesInitial: () =>
      Exec.API.exec({
        getCommand: () =>
          `${Script.defaults.commands.pacman} -S ${['base-devel', 'git'].join(
            ' ',
          )}`,
        withShell: true,
        throwOnCommandError: true,
        modeOutput: IOutputMode.StdOutErr,
      }),

    packagesWhenAURIsAvailable: () =>
      this.utilities.installPackagesUsingAUR({
        packages: [
          'pacman-contrib',
          'vim',
          'ripgrep',
          'exa',
          'direnv',
          'mkcert',
          'libfaketime',
          'watchman-bin',
          'bat',
          'fzf',
          'fd'
          // this thing is buggy, better use official install instructions
          // 'asdf-vm',
        ],
      }),

    packageTini: async <T1 extends {
      readonly arch: string
    }>({
      arch,
    }: T1) => {
      let nameBinary = ''

      // https://github.com/krallin/tini/releases/
      switch (arch) {
        case 'x86_64':
          nameBinary = 'tini-amd64'
          break

        default:
          throw new Error(`${arch} is unsupported`)
      }

      const { tagName } = await Script.getters.latestVersionFromGithub({
        nameRepository: 'krallin/tini',
      })

      const stateThis = {
        pathFile: '/usr/local/bin/tini',
      }

      await Script.instances.fileHandler.API.downloadFile({
        pathFile: stateThis.pathFile,
        request: `https://github.com/krallin/tini/releases/download/${tagName}/${nameBinary}`,
        requestOptions: {
          redirect: 'follow',
        },
        transformURL: false,
      }).fetch()

      await Deno.chmod(stateThis.pathFile, 0o755)
    },

    cleanUp: () =>
      Exec.API.exec({
        getCommand: () =>
          [
            'rm -rf /var/cache/pacman/*'
          ].join(' '),
        withShell: true,
        throwOnCommandError: true,
        modeOutput: IOutputMode.StdOutErr,
      })
  }

  taskUser = {
    afterUserExist: async () => {
      const commandSetupFisher = `/usr/bin/fish -l -c "${[
        'curl -sL https://git.io/fisher | source',
        'fisher install jorgebucaran/fisher',
        'fisher install beckend/fish-plugin',
        '_beckend_plugins_install',
      ].join(' && ')}"`
      const fileTmpFish = '/tmp/install-fish.sh'

      await Script.instances.fileHandler.API.writeFile({
        contentFile: commandSetupFisher,
        pathFile: fileTmpFish,
      })

      await Promise.all([
        // Spacevim
        Script.instances.fileHandler.API.downloadFile({
          request:
            'https://raw.githubusercontent.com/SpaceVim/SpaceVim/master/mode/dark_powered.toml',
          returnContent: true,
        })
          .fetch()
          .then(async ({ contentFile }) => {
            await Script.instances.fileHandler.API.writeFile({
              contentFile,
              pathFile: `/home/${this.options.user.name}/.SpaceVim.d/init.toml`,
            })

            await Exec.API.exec({
              getCommand: () =>
                `chown ${this.options.user.name}:users -R /home/${this.options.user.name}/.SpaceVim.d`,
              throwOnCommandError: true,
              modeOutput: IOutputMode.StdOutErr,
            })

            await Exec.API.execMulti({
              getCommands: () => [
                'echo "Installing SpaceVim"',
                `runuser -l ${this.options.user.name} -s /bin/sh -c "bash -c 'curl -sLf https://spacevim.org/install.sh | bash >/dev/null 2>&1'"`,
                `cp -r /home/${this.options.user.name}/.SpaceVim* /root`,
                'ln -sf /root/.SpaceVim /root/.vim ',
              ],
              throwOnCommandError: true,
              modeOutput: IOutputMode.StdOutErr,
            })
          }),

        // ASDF
        Exec.API.exec({
          getCommand: () =>
            [
              `runuser -l ${this.options.user.name} -s /bin/sh -c '`,
              [
                'git clone https://github.com/asdf-vm/asdf.git ~/.asdf',
                'mkdir -p ~/.config/fish/completions',
                'ln -s ~/.asdf/completions/asdf.fish ~/.config/fish/completions',
              ].join(' && '),
              '\'',
            ].join(''),
          withShell: true,
          throwOnCommandError: true,
          modeOutput: IOutputMode.StdOutErr,
        }),

        // fisher, installing using fish failed, needed this workaround
        Exec.API.execMulti({
          getCommands: () => [
            `bash -x ${fileTmpFish}`,
            `runuser -l ${this.options.user.name} -s /bin/sh -c "bash -x ${fileTmpFish}"`,
            `rm ${fileTmpFish}`,
          ],
          throwOnCommandError: true,
          modeOutput: IOutputMode.StdOutErr,
        }),
      ])

      // files copy
      await Exec.API.exec({
        getCommand: () =>
          [
            `runuser -l ${this.options.user.name} -s /bin/sh -c '`,
            [
              `cp -r ${Script.defaults.dirName}/user-home/. /home/${this.options.user.name}`,
            ].join(''),
            '\'',
          ].join(''),
        withShell: true,
        throwOnCommandError: true,
        modeOutput: IOutputMode.StdOutErr,
      })
    },
  }

  constructor(options: ICommandCommonOptions) {
    super(async () => {
      this.options = options

      const [logger] = await Promise.all([
        Logger.New({
          levelLog: LoggerLevel.Debug,
          name: 'install-os',
        }),
      ])

      this.logger = logger

      await this.tasks.checks()
    })
  }

  main = async () => {
    await Promise.all([
      Script.getters.machineHardwareName().then((arch) => this.tasks.packageTini({ arch })),

      this.tasks.writePacmanConf({ pathFile: '/etc/pacman.conf' }),

      this.tasks.handleLocale({
        CMDLocaleGen: 'locale-gen',
        pathDirETC: '/etc',
      }),

      this.tasks.adjustMakeConf(),
      this.tasks.writeMirrorList({ pathFile: '/etc/pacman.d/mirrorlist' }),
      this.tasks.pacCache()
    ])

    await this.tasks.packagesInitial()
    await this.tasks.addUser()
    await this.tasks.installAUR()
    await Promise.all([
      this.tasks.packagesWhenAURIsAvailable(),
      this.taskUser.afterUserExist(),
    ])

    await this.tasks.cleanUp()
  }
}
