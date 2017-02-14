exports.tasks = {
    after: ['install_dependencies'],
    install_dependencies: {
        exec: [
            server => { return `ssh-keyscan bitbucket.org >> /home/${server.user}/.ssh/known_hosts` },
            server => { return `git clone git@bitbucket.org:kovchiy/spikes.git /home/${server.user}/app`}
        ]
    }
}
