const fs = require('fs')
var punycode = require('punycode')
var Config = require('../lib/instance.js').Config

/**
 * Конструктор конфигов nginx
 * Перенаправляет запросы с обслуживаемых доменов
 * на нужные nodejs сервера
 *
 * @class      Config (server, config, config_template)
 * @param      {<type>}  server  Сервер, для которого строится конфиг
 * @return     {Object}  { Возвращает конфиг в нужном формате }
 */
var config = function (server, project, port) {
    return {
        'settings': [{
            // Здесь могут быть дополнительные настройки
            // 'tcp': 'nopush',
            // 'sendfile': 'on'
        }],
        'servers': [
            // Сервер перенаправляет запросы с www. на домен без www
            {
                'listen': '80',
                'server_name': `www.${punycode.toASCII(project)}`,
                'return': `301 http://${punycode.toASCII(project)}$request_uri`
            },
            // Проксирование запросов до ноды
            {
                'listen': '80',
                'server_name': punycode.toASCII(project),
                'location /': {
                    'proxy_pass': `http://127.0.0.1:${port}`,
                    'proxy_set_header': 'Host $host',
                    'proxy_set_header': 'X-Real-IP $remote_addr',
                    'proxy_set_header': 'X-Forwarded-For $proxy_add_x_forwarded_for'
                }
            }]
    }

}

var config_template = function (server, config, config_file) {
    /**
     * Разворачиваем JS объект в nginx конфиг
     *
     * @param      {<type>}            object       Разворачиваемый объект
     * @param      {(Array|Function)}  config_file  Массив из которого получится файл с конфигом
     * @param      {<type>}            property     Текущая сущность
     * @param      {number}            indent       Отступ \t для читаемости
     */
    var expand = function (object, config_file, property, indent) {
        // Если к нам пришёл объект,
        // разворачиваем все его свойства рекурсивно
        if (typeof(object) == 'object') {
            // Печатаем "property {", если оно указано
            if (property) {
                config_file.push(Array(indent).join('\t') + `${property} {`)
            }

            Object.keys(object).map(function(property_, index_) {
                config_file = expand(object[property_], config_file, property_, indent + 1)
            })

            // Закрываем } от property, если было указано
            if (property) {
                config_file.push(Array(indent).join('\t') + '}\n')
            }

        // Если пришло простое описание свойства
        // то просто пишем
        } else {
            config_file.push(Array(indent).join('\t') + `${property} ${object};`)
        }

        return config_file
    }

    // Сначала форматируем настройки
    config.settings.forEach(setting => {
        config_file = expand(setting, config_file)
    })

    // Форматируем настройки серверов
    config.servers.forEach(server => {
        config_file = expand(server, config_file, 'server', 1)
    })

    return config_file
}


exports.tasks = {
    after: ['delete_default_config'],
    delete_default_config: {
        exec: ['sudo rm /etc/nginx/sites-enabled/default']
    },
    update_config: {
        code: function (server) {
            fs.writeFile(`/tmp/${server.name}_nginx`, Config(server, config, config_template))
        },
        exec: [ server => { return `sudo mv /tmp/${server.name}_nginx /etc/nginx/sites-enabled/` } ]
    },
    restart: {
        exec: [ 'sudo service nginx reload', 'sudo service nginx restart' ]
    }
}
exports.config = config
exports.config_template = config_template

