// Чтобы получить имя пользователя, который будет деплоить
// и подключатьcz к серверу по ССШ используя ключ.
const util = require('util')
const fs = require('fs')
const path = require('path')
var local_exec = require('child_process').exec
var clientSSH = require('simple-ssh')

/**
 * Класс для управление машиной по SSH
 *
 * @class      Instance (name)
 * @param      {<type>}           config  Конфиг из settings.json
                                          Например:
                                             "spikes": {
                                                "host": "78.24.222.246",
                                                "user": "spike",
                                                "pass": "pasdasdasdas",
                                                "privateKey": "/User/lol/.ssh/id_rsa",
                                                "dependencies": ["nginx", "nodejs", "npm"],
                                                "removeDependencies": ["apache2*", "php5"]
                                              }
 * @return     {(Object|string)}  { Управляющий класс }
 * @method     {<type>}           init        Развернуть на сервере по конфигу
 * @method     {<type>}           exec        Запустить набор команд в массиве
 * @method     {<type>}           upload      Загрузить файл или папку
 * @method     {<type>}           assignKey   Привязать локальный публичный ключ
 * @param      {<type>}           config      Первоначальный конфиг
 */
exports.Instance = (function (config) {
    var privateKey = 'projects/' + config.name + '/' + config.privateKey
    var publicKey = privateKey + '.pub'

    var sshAddress = config.user + '@' + config.host

    var ssh = new clientSSH({
        host: config.host,
        user: config.user,
        pass: config.pass,
        // ключ чо-та не работает
        key: require('fs').readFileSync(privateKey),
        baseDir: `/home/${config.user}/app/`,
    })

    function init () {
        // Команды для удаления мусора и установки зависимостей
        var removeDependencies = (config.default.removeDependencies || []).concat(config.removeDependencies || [])
        var installDependencies = (config.default.dependencies || []).concat(config.dependencies || [])



        var installCommands = installPackages(installDependencies)
        var removeCommands = [removePackages(removeDependencies)]

        // Первые команды выполняем под рутом
        // Потому что другого пользователя ещё нет
        ssh = new clientSSH({
            host: config.host,
            user: 'root',
            key: require('fs').readFileSync(privateKey)
        })
        sshAddress = 'root@' + config.host

        // Запускаем команды перед установкой софта на инстант
        exec(__configurePackage('instance', 'before'), {}, function () {

            // Меняем пользователя
            ssh = new clientSSH({
                host: config.host,
                user: config.user,
                pass: config.pass,
                key: require('fs').readFileSync(privateKey),
                baseDir: `/home/${config.user}/app/`
            })
            sshAddress = config.user + '@' + config.host


            // Устанавливаем софт и настраиваем после
            exec(removeCommands
                    .concat(installCommands)
                    .concat(__configurePackage('instance', 'after'))
            )
        })
    }

    function getProjects () {
        return fs.readdirSync('projects/' + config.name)
            .filter(file => fs.statSync(path.join('projects/' + config.name, file)).isDirectory())
    }

    function installPackages (packages) {
        // Список команд для установки
        var installCommands = []

        console.log(`Install packages to ${config.name} - ${config.host}: ${packages.join(', ')}`)

        // Готовит команду для установки пакетов
        // через apt-get
        function __aptInstallTask (packages) {
            return 'sudo DEBIAN_FRONTEND=noninteractive apt-get install --yes --force-yes ' + packages.join(' ')
        }


        // Выполняем связанные задачи с пакетами installDependencies ДО установки
        installCommands = installCommands.concat(__configurePackages(packages, 'before'))

        // Установка пакетов
        installCommands = installCommands.concat([
            'sudo apt-get update',
            __aptInstallTask(packages)
        ])

        // Выполняем связанные задачи с пакетами installDependencies ПОСЛЕ установки
        installCommands = installCommands.concat(__configurePackages(packages, 'after'))

        return installCommands
    }

    // Настройка пакетов
    // packageFIFO - список пакетов First In First Out
    // order - в каком порядке
    function __configurePackages (packagesFIFO, order) {
        // Копируем массив
        var packagesFIFO = packagesFIFO.slice()

        // Если пакеты закончились, возвращаем пустой массив
        // для итоговой склейки
        if (packagesFIFO.length == 0){
            return []
        }

        // Берём первый пакет и списка
        var packageName = packagesFIFO.shift()

        return __configurePackage(packageName, order).concat(__configurePackages(packagesFIFO, order))
    }

    function __getConfigurations (packageName) {
        var packageConfigurations = []
        // Конфигурация для пакета по умолчанию
        try {
            packageConfigurations.push(require(`../instance/${packageName}.js`))

        } catch (e) { }

        // Конфигруация пакета из проектов
        getProjects().forEach(project => {
            try {
                packageConfigurations.push(require(`../projects/${config.name}/${project}/instance/${packageName}.js`))

            } catch (e) { }
        })

        return packageConfigurations
    }

    function __configurePackage (packageName, order) {
        // Подготавливаем команды для настройки пакета на сервере
        // task - может быть объект { exec: [], callback: function (server) }
        // или название таска, который лежит в package.tasks
        function prepare_task (configuration, task) {
            // Итоговый список комманд
            // Сперва callback на сервере
            // Потом exec
            var commands = []

            if (typeof(task) != 'object') {
                var taskObj = configuration.tasks[task]
            } else {
                var taskObj = task
            }

            if (taskObj.code) {
                if (taskObj.localExec) {
                    taskObj.code(config)
                } else {
                    commands.push(`gulp deploy-instance-config --server ${config.name} --package ${packageName} --task ${task} --type code`)
                }
            }

            if (taskObj.exec) {
                commands = commands.concat(taskObj.exec)
            }
            return commands
        }

        var configureCommands = []

        var packageConfigurations = __getConfigurations(packageName)

        packageConfigurations.forEach(configuration => {
            if (configuration.tasks[order]) {
                configuration.tasks[order].forEach(task => {
                    configureCommands = configureCommands.concat(prepare_task(configuration, task))
                })
                console.log(`Configuration ${order} install ${packageName} on ${config.name} - ${config.host}`)
            }
        })

        return configureCommands
    }

    /**
     * Выполнение задачи связанной с каким-то установленным пакетом
     *
     * @param      {<string>}  packageName  Название пакета
     * @param      {<string>}  task         Нзавание задачи
     * @param      {<string>}  type         Тип выполнение (all, exec, code)
     *                                      exec - выполнить команды ОС
     *                                      code - локальный код
     *                                      all - всё вместе
     *
     */
    function runPackageTask (packageName, task, type) {
        /**
         * Выполнение JS кода связанного с задачей
         * Чаще всего этот код нужно запускать на сервере
         *
         * @param      {<type>}  task    Название задачи
         */
        function run_code (task) {
            // Выполняем команды из настроик по умолчанию
            // и всех проектов
            packageConfigurations.forEach(configuration => {
                var code = configuration.tasks[task].code

                // Выполняется локальный код
                if (code) {
                    code(config)
                }
            })
        }

        /**
         * Выполнение команд ОС
         *
         * @param      {<type>}  task    Название задачи
         */
        function run_command(task) {
            var commands = []
            // Собираем команды из настроик по умолчанию
            // и всех проектов
            packageConfigurations.forEach(configuration => {
                var configurationCommands = configuration.tasks[task].exec

                if (configurationCommands) {
                    commands = commands.concat(configurationCommands)
                }
            })

            if (commands.length > 0) {
                // local_exec не можем выполнять из-за sudo
                // TODO: попробовать spawn с uid и gid
                // При вызове команды на сервере, он сам к себе подключается по ssh
                exec(commands)
            }
        }
        var packageConfigurations = __getConfigurations(packageName)

        // В зависимости от типа запуска
        // выполняем разный набор команд
        switch (type) {
        case 'code':
            run_code(task)
            break
        case 'exec':
            run_command(task)
            break
        case 'all':
            run_code(task)
            run_command(task)
        }

    }

    function removePackages (packages) {
        // Готовит команду для установки пакетов
        // через apt-get
        return 'sudo DEBIAN_FRONTEND=noninteractive apt-get remove --yes --force-yes ' + packages.join(' ')
    }

    /**
     * Выполнение массива команд на сервере
     *
     * @param      {<array>}  commands  Набор команд в виде строки или коллбек server => { return command }
     * @param      {<object>}  options   Настройки выполнения exec для simple-ssh
     */
    function exec (commands, options, callback) {
        // Готовим команды по порядку выполнения
        // Без pty: true не будет выполняться установка
        if (callback) {
            var exec_done = 0
            var exit_counter = function (code) {
                exec_done = exec_done + 1
                if (exec_commands.length == exec_done) {
                    callback()
                }
                if (options.exit) {
                    options.exit()
                }
            }

            var exec_options = util._extend({ pty: true, out: console.log.bind(console), exit: exit_counter}, options)
        } else {
            var exec_options = util._extend({ pty: true, out: console.log.bind(console) }, options)
        }

        var exec_commands = commands.map(command => {
            if (typeof(command) == 'function') {
                return command(config)
            } else {
                return command
            }
        })

        exec_commands.forEach(command => {
            ssh.exec(command, exec_options)
        })

        // Запускает команды
        ssh.start()
    }

    /**
     * Закачиваем файл или папку на сервер
     *
     * @param      {<string>}  source       Локальное расположение файлы. Относительно папки приложения
     * @param      {<string>}  destination  Путь назначения на сервере. Если не указан, то закачивается
     *                                      в домашнюю папку с таким же названием
     */
    function upload (source, destination) {
        var remotePath = destination || `/home/${config.user}/`
        var command = `scp -i ${privateKey} -r ${source} ${sshAddress}:${remotePath}`

        local_exec(command, function (err, stdout, stderr) {})
    }

    /**
     * Разрешаем доступ ключа id_rsa.pub
     * для подключения по ssh
     * Требует ручной ввод пароля, работает не во всех терминалах
     * TODO: сделать лучше
     */
    function assignKey () {
        var command = `cat ~/.ssh/id_rsa.pub | ssh ${sshAddress} "mkdir -p ~/.ssh && cat >>  ~/.ssh/authorized_keys"`
        local_exec(command, function (err, stdout, stderr) {})
    }

    return {
        init: init,
        exec: exec,
        upload: upload,
        runPackageTask: runPackageTask,
        config: config,
        projects: getProjects()
    }
})



/**
 * Абстрактный класс конструктора конфигов
 * для серверов и проектов: nginx, supervisor
 *
 * @class      Config (name)
 * @param      {<type>}    server           Сервер, для которого строится конфиг
 * @param      {Function (server, project, port) }  config           Функция, возвращает объект с конфигом, для конкретного проекта
 * @param      {Function (project, config, config_file)}  config_template  Превращает объект с конфигом, в нужный формат
 * @return     {string[]}  { Возвращает конфиг в нужном формате }
 */
exports.Config = (function (server_config, config, config_template) {
    var configs = {}
    var config_file = []

    // Получаем список всех проектов для выбранного сервера
    function getProjects (serverName) {
        return fs.readdirSync('projects/' + serverName)
            .filter(file => fs.statSync(path.join('projects/' + serverName, file)).isDirectory())
    }

    var projects = getProjects(server_config.name)
    projects.forEach(project => {
        // Для каждого проекта генерируем свой конфиг и номер порта
        // Номер порта определяется исходя из первого указанного в package.json - server_config.port
        // или поумолчанию server_config.default.port
        var port = parseInt(server_config.port || server_config.default.port) + Object.keys(configs).length

        configs[project] = config(server_config, project, port)
    })

    Object.keys(configs).map(function(project, project_index) {
        // Превращаем JS объект в текстовой конфиг
        config_file = config_template(project, configs[project], config_file)
    })

    return config_file.join('\n')
})