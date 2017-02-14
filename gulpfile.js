'use strict'
/**
 * Запуск сервера проекта:  gulp project --name ИМЯ_ПРОЕКТА --port ПОРТ
 * Собрать проект:          gulp project-build --name ИМЯ_ПРОЕКТА
 * Собрать все проекты:     gulp project-build-all
 */


// Gulp requires
let gulp = require('gulp')
let concat = require('gulp-concat')
let stylus = require('gulp-stylus')
let base64 = require('gulp-base64')
let copy = require('gulp-copy')
let rename = require('gulp-rename')
let autoprefixer = require('gulp-autoprefixer')
let browserSync = require('browser-sync').create()

// Other requires
let spawn = require('child_process').spawn
let exec = require('child_process').exec
let beast = require('./lib/gulp-beast.js')
let argv = require('minimist')(process.argv)

// Deploy requires
let pjson = require('./package.json')
let fs = require('fs')
let hosting = require('./lib/server.js')
let Instance = require('./lib/instance.js').Instance
let InstanceModel = require('./models/instance.js')

if (!argv.port) {
    argv.port = '7999'
}


/*
 * Frontend-сборка
 */

// Общие обязательные директории
let path = {
    jsBlocks: [
        'blocks/*/*.bml',
    ],
    jsClientOnly: [
        'lib/missevent.js',
        'lib/typo.js',
        'lib/beast.js',
    ],
    css: [
        'blocks/Base/Base.styl',
        'blocks/*/*.styl',
    ],
    assets: [],
    pages: [],
}

// Получает информацию для сборки проекта
function getProjectInfo (name) {
    let projectBlocksPath = `projects/${name}/blocks/*/*.bml`
    let jsClientPath = path.jsClientOnly.concat(path.jsBlocks, projectBlocksPath)
    let blocks = path.jsBlocks.concat(projectBlocksPath)
    let cssPath = [].concat(
        path.css[0],
        `projects/${name}/blocks/Base/Base.styl`,
        path.css[1],
        `projects/${name}/blocks/*/*.styl`
    )
    let assetsPath = path.assets.concat(`projects/${name}/assets/*`)
    let pagesPath = path.pages.concat(`projects/${name}/pages/*.bml`)

    return {
        name: name,
        path: {
            js: jsClientPath,
            css: cssPath,
            assets: assetsPath,
            pages: pagesPath,
            blocks: blocks,
        },
        serverProcess: undefined,
    }
}

// Текущий проект (для project-задач)
let project = getProjectInfo(argv.name)

// Сборочный dev-сервер
gulp.task('project', function () {
    if (!argv.name) {
        console.error('ERROR: --name is not defined')
        process.exit()
    }

    gulp.watch(project.path.js,     ['project-js', 'project-server'])
    gulp.watch(project.path.css,    ['project-css', 'project-server'])
    gulp.watch(project.path.assets, ['project-assets', 'project-server'])
    gulp.watch(project.path.blocks, ['project-blocks', 'project-server'])
    gulp.watch(project.path.pages,  ['project-pages', 'project-server'])

    gulp.start('project-server-after-build', 'browser-sync-init')
})

// Запуск сервера после сборки
gulp.task('project-server-after-build', ['project-build'], function () {
    gulp.start('project-server')
})

// Сборка одного проекта
gulp.task(
    'project-build',
    ['project-js', 'project-css', 'project-assets', 'project-blocks', 'project-pages'],
    function (done) {
        done()
        popProjectToBuild()
    }
)

// Собрать все проекты
gulp.task('project-build-all', function () {
    exec('ls -d projects/*/*', function (error, stdout, stdin) {
        stdout.replace(/\n$/, '').split('\n').forEach(function (projectName) {
            projectName = projectName.replace('projects/', '')
            projectsToBuild.push(getProjectInfo(projectName))
        })
        popProjectToBuild()
    })
})

let projectsToBuild = []
function popProjectToBuild () {
    if (projectsToBuild.length > 0) {
        project = projectsToBuild.pop()
        gulp.start('project-build')
    }
}

// Запуск сервера проекта
gulp.task('project-server', function () {
    project.serverProcess && project.serverProcess.kill()
    project.serverProcess = spawn('node', ['--use-strict', 'lib/project-server.js', '--name', argv.name, '--port', argv.port])
    project.serverProcess.stdout.on('data', function (data) {
        console.log(data.toString())
        if (!project.serverProcess.browserReloaded) {
            project.serverProcess.browserReloaded = true
            browserSync.reload()
        }
    })
    project.serverProcess.stderr.on('data', function (data) {
        console.log(data.toString())
        project.serverProcess.kill()
    })
    project.serverProcess.on('error', function (data) {
        console.log(data.toString())
        project.serverProcess.kill()
    })
})

// Запуск browser-sync
gulp.task('browser-sync-init', function() {
    browserSync.init({
        proxy: 'localhost:' + argv.port,
        port: (parseInt(argv.port) + 1).toString(),
        ui: false,
        notify: false,
        open: false,
        ghost: false,
    })
})

// Интерфейсные блоки для сборки HTML на сервере
gulp.task('project-blocks', function () {
    return gulp.src(project.path.blocks)
        .pipe(beast())
        .pipe(concat('blocks.js'))
        .pipe(gulp.dest('./build/' + project.name))
})

// JS для клиента
gulp.task('project-js', function () {
    return gulp.src(project.path.js)
        .pipe(beast())
        .pipe(concat('client.js'))
        .pipe(gulp.dest('./build/' + project.name))
})

// Стили для клиента
gulp.task('project-css', function () {
    return gulp.src(project.path.css)
        .pipe(base64({
            extensions: ['svg'],
            maxImageSize: 10 * 1024,
            debug: false,
        }))
        .pipe(concat('client.styl'))
        .pipe(stylus())
        .pipe(autoprefixer({
            browsers: ['iOS >= 7'],
            cascade: false
        }))
        .pipe(gulp.dest('./build/' + project.name))
})

// Статика вне блоков для клиента
gulp.task('project-assets', function () {
    return gulp.src(project.path.assets)
        .pipe(copy('.'))
        .pipe(gulp.dest('./build/' + project.name + '/assets'))
})

// Сборка страниц проекта и перезапуск его сервера
gulp.task('project-pages', function () {
    return gulp.src(project.path.pages)
        .pipe(beast())
        .pipe(rename(function (path) { path.extname = '.js' }))
        .pipe(gulp.dest('./build/' + project.name + '/pages'))
})


/*
 * Backend-сборка
 */


// Выполняем задачу на сервере
// Чаще всего эту команду нужно запускать на сервере
// Пример: deploy-instance-task --server spikes --package nginx --task restart --type all
// Задача связана с конкретным сервером, конкретным софтом и задачей связанной с этим софтом
gulp.task('deploy-instance-task', function () {
    if (!argv.server) {
        console.error('ERROR: --server is not defined')
        process.exit()
    }

    if (!argv.package) {
        console.error('ERROR: --package is not defined')
        process.exit()
    }

    if (!argv.task) {
        console.error('ERROR: --task is not defined')
        process.exit()
    }

    if (!argv.type) {
        console.error('ERROR: --type is not defined')
        process.exit()
    }

    let selectedServer = hosting.servers.filter(server => { return server.name == argv.server })[0]
    let server = new Instance(selectedServer)

    server.runPackageTask(argv.package, argv.task, argv.type)

})

// Разворачивает в машины из servers
// окружение описанное в deploy.server.default — package.json
// и settings.json в папке сервера
gulp.task('deploy-instances', function () {
    console.log('Preparing instances...')

    hosting.servers.forEach(currentServer => {
        let server = new Instance(currentServer)

        console.log(`Preparing ${server.config.name} - ${server.config.host}`)
        server.init()
    })
})

// Сборка фронтенда
gulp.task('deploy-system', function () {
    hosting.servers.forEach(currentServer => {
        let server = new Instance(currentServer)

        let model = {
            name: server.config.name,
            host: server.config.host,
            user: server.config.user,
            pass: server.config.pass,
            projects: server.projects.map(project => { return { domain: project } } )
        }

        let instanceApi = InstanceModel.api(hosting.neo4jServer)

        instanceApi.put(model, (err, res) => { console.log(res) })

        console.log(`Frontend deployment on ${server.config.name} - ${server.config.host}`)
        server.exec([
            'git checkout .',
            'git pull',

            'npm install',

            // Собираем все проекты (вообще нужно только для этого сервера)
            'gulp project-build-all',

            // Обновляем конфиг для веб сервера и перезагружаем его
            `gulp deploy-instance-task --server ${server.config.name} --package nginx --task update_config --type all`,
            `gulp deploy-instance-task --server ${server.config.name} --package nginx --task restart --type all`,

            // Обновляем конфиг супервизора и перезагружаем его
            `gulp deploy-instance-task --server ${server.config.name} --package supervisor --task update_config --type all`,
            `gulp deploy-instance-task --server ${server.config.name} --package supervisor --task restart --type all`
        ])
    })
})
