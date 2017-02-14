var Instance = require('../lib/instance.js').Instance

exports.tasks = {
    before: ['add_user', 'copy_keys'],
    add_user: {
        exec: [
            server => { return `adduser --disabled-password --gecos "" ${server.user}` },
            server => { return `adduser ${server.user} sudo` },
            server => { return `echo "${server.user}:${server.pass}" | chpasswd` },
            server => { return `mkdir -p /home/${server.user}/.ssh/` },
            server => { return `cp -p ~/.ssh/authorized_keys /home/${server.user}/.ssh/authorized_keys` },
            server => { return `mkdir -p /home/${server.user}/app/` },
            server => { return `mkdir -p /home/${server.user}/logs/` },
            server => { return `chown -R ${server.user}:${server.user} /home/${server.user}/` }
        ]
    },
    copy_keys: {
        code: function (server) {

            var instance = new Instance(server)
            console.log(`Coping RSA keys to ${server.name} - ${server.host}`)

            instance.upload('package_rsa', `/home/${server.user}/.ssh/id_rsa`)
            instance.upload('package_rsa.pub', `/home/${server.user}/.ssh/id_rsa.pub`)
        },
        localExec: true
    }
}