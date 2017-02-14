const fs = require('fs')
var Config = require('../lib/instance.js').Config

/**
 * Конструктор конфигов для supervisor
 * Программа запускает все проекты и следит, чтобы они работали
 *
 * @class      Config (server, config, config_template)
 * @param      {<type>}          server  Сервер, для которого строится конфиг
 * @return     {(Array|Object)}  { Возвращает конфиг в нужном формате }
 */
var config = function (server, project, port) {
    return {
        'user': server.user,
        'command': `node --use_strict lib/project-server.js --name ${server.name}/${project} --port ${port}`, // Запускаем проект
        'directory': `/home/${server.user}/app/`,
        'stdout_logfile': `/home/${server.user}/logs/${server.name}.${project}.webserver.log`,
        'stderr_logfile': `/home/${server.user}/logs/${server.name}.${project}.webserver.error.log`,
        'autostart': true,
        'autorestart': true,
        'redirect_stderr': true
    }
}

var config_template = function (project, config, config_file) {
    config_file.push(`[program:${project}]`)

    Object.keys(config).map(function(property) {
        config_file.push(`${property}=${config[property]}`)
    })

    config_file.push(' ')

    return config_file
}

exports.tasks = {
    update_config: {
        code: function (server) {
            fs.writeFile(`/tmp/${server.name}_supervisor.conf`, Config(server, config, config_template))
        },
        exec: [server => { return `sudo mv /tmp/${server.name}_supervisor.conf /etc/supervisor/conf.d/` }]
    },
    restart: {
        exec: [
            'sudo supervisorctl stop all',
            'sudo service supervisor restart',
            'sudo supervisorctl start all'
        ]
    }
}
exports.config = config
exports.config_template = config_template