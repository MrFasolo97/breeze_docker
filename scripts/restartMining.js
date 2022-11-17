const axios = require('axios')
const fs = require('fs')
const logr = require('./src/logger')
const MongoClient = require('mongodb').MongoClient
const stream = require('stream')
const { resolve } = require('dns')
const promisify = require('util').promisify;

// https://stackoverflow.com/a/61269447  ===> CC BY-SA 4.0

const finished = promisify(stream.finished);

async function downloadFile(fileUrl, outputLocationPath) {
  const writer = fs.createWriteStream(outputLocationPath);
  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  }).then(response => {
    response.data.pipe(writer);
    return finished(writer); //this is a Promise
  });
}
// END OF COPY-PASTED, SLIGHTLY MODIFIED CODE WITH CC BY-SA 4.0 LICENSE <===

const db_name = process.env.DB_NAME || 'breeze'
const db_url = process.env.DB_URL || 'mongodb://localhost:27017'

const genesisFilePath = "/breeze/genesis/genesis.zip"
const backupUrlMain = process.env.BACKUP_URL || "https://backup.breezechain.org/"
const backupUrlOrig = "https://backup.breezechain.org/"

let createNet = parseInt(process.env.CREATE_NET || 0)
let shouldGetGenesisBlocks = parseInt(process.env.GET_GENESIS_BLOCKS || 0)

let replayState = parseInt(process.env.REPLAY_STATE || 0)
let rebuildState = parseInt(process.env.REBUILD_STATE || 0)
let replayCheck = 0
let rebuildUnfinished = 0

if (rebuildState) {
    replayState = 0
    rebuildUnfinished = 1
}

let config = {
    host: 'http://localhost',
    port: process.env.HTTP_PORT || '3001',
    homeDir: "/home/ec2-user/",
    testnetDir: "/home/ec2-user/breeze_testnet/tbreeze/breeze_testnet/",
    mainnetDir: "/home/ec2-user/tbreeze/breeze/",
    scriptPath: "./scripts/start_mainnet.sh",
    logPath: "/breeze/log/breeze.log",
    replayLogPath: "/breeze/log/breeze_replay.log",
    backupUrl: backupUrlOrig + "$(TZ=GMT date +\"%d%h%Y_%H\").tar.gz",
    blockBackupUrl: backupUrlMain + "blocks.bson",
    genesisSourceUrl: backupUrlMain + "genesis.zip",
    mongodbPath: "/data/db"
}

let curbHeight = 0
let prevbHeight = 0
var replayFromDatabaseCount = 0
var reRunCount = 0
// try restarting before replaying for non-zero same height
let tryRestartForSameHeight = 3
let restartThreshold = 3
let sameHeightCount = 0
// How many times same height before replaying from database
var sameHeightThreshold = 5
var replayCount = 0
// How many times replay from database before rebuilding state
var replayCountMax = 5


var mongo = {
    init: (cb) => {
        MongoClient.connect(db_url, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }, function(err, client) {
            if (err) throw err
            this.db = client.db(db_name)
            logr.info('Connected to '+db_url+'/'+this.db.databaseName)
            cb()
        })
    },
    dropDatabase: (cb) => {
        db.dropDatabase(function() {
            logr.info("Dropped breeze mongo db.")
            if (typeof cb == 'function') {
                cb()
            }
        })
    },
    getHeadBlock: () => {
        if (typeof db !== 'undefined' && typeof db.state !== 'undefined') {
            let blockState = db.state.findOne({"id": 1})
            return blockState.headBlock
        }
        return -1
    }
}

function getCurTime() {
    var td = new Date()
    var d = String(td.getDate()).padStart(2, '0')
    var m = String(td.getMonth()).padStart(2, '0')

    var y = String(td.getFullYear())
    var h = String(td.getHours()).padStart(2, '0')
    var mn = String(td.getMinutes()).padStart(2, '0')
    var s = String(td.getSeconds()).padStart(2, '0')

    var dt = y + "/" + m + "/" + d + " " + h + ":" + mn + ":" + s
    return dt
}

var exec = require('child_process').exec;

function runCmd(cmdStr) {
    exec(cmdStr,
        function (error, stdout, stderr) {
            if (error !== null) {
                logr.info('exec error: ' + error);
                logr.info('stdout: ' + stdout);
                logr.info('stderr: ' + stderr);
            }
        }
    );
}

function getUrl() {
    var url = config.host + ":" + config.port
    return url
}

// sleep time expects milliseconds
function sleep (time) {
   return new Promise((resolve) => setTimeout(resolve, time));
}

function replayFromSelfBackup() {
    backupUrl = config.mongodbPath + "/backup"
}

function checkBlocksFlow() {
    const blocks = mongo.getHeadBlock()
    sleep(5000)
    if (mongo.getHeadBlock() > blocks) {
        return true
    } else {
        return false
    }
}

async function getGenesisBlocks() {
    resolve(true)
    /*
    return new Promise((resolve, reject) => {
        mongo.init(()=> {
            if (mongo.getHeadBlock() > 0) {
                logr.info("Skipping getGenesisBlock as we already have block data.")
            } else {
                logr.info("Genesis collection started.")
                logr.info("Dropping breeze mongo db (getting genesis blocks)")
                mongo.dropDatabase()
            }
        })
        if (fs.existsSync(genesisFilePath) || mongo.getHeadBlock() > 0) {
            logr.info("Genesis.zip already exists")
            shouldGetGenesisBlocks = 0
            resolve(true)
        } else {
            logr.info("Getting genesis.zip")
            shouldGetGenesisBlocks = 0
            cmd = "cd /breeze"
            cmd += " && "
            cmd += "if [[ ! -d \"/breeze/genesis\" ]]; then `mkdir -p /breeze/genesis`; fi;"
            runCmd(cmd)
            downloadFile(config.genesisSourceUrl, "/breeze/genesis/genesis.zip").then(()=>{resolve(true)})
        }
    })
    */
}

async function downloadBlocksFile(cb) {
    return new Promise((resolve, reject) => {
        let mtime = null
        if (fs.existsSync('/data/breeze/blocks/blocks.bson')) {
            mtime = fs.statSync('/data/breeze/blocks/blocks.bson', (error, stats) => {
                if(error) {
                    console.log(error)
                } else {
                    return stats.mtime.getTime()
                }
            })
        }
        if(Date.now() - mtime > 86400000) { // if the file is older than 1 day, then re-download it.
            backupUrl = config.blockBackupUrl
            logr.info("Downloading blocks.bson file... it may take a while.")
            downloadFile(backupUrl, "/data/breeze/blocks/blocks.bson").then(() =>{
                if (typeof cb == 'function') {
                    cb()
                }
                resolve(true)
            })
        } else {
            resolve(true)
        }
    })
}

function replayAndRebuildStateFromBlocks(cb) {
    rebuildUnfinished = 1
    cmd = "if [[ ! `ps aux | grep -v grep | grep -v defunct | grep mongod` ]]; then `mongod --dbpath " + config.mongodbPath + " > mongo.log 2>&1 &`; fi"
    runCmd(cmd)

    cmd = "pgrep \"src/main\" | xargs --no-run-if-empty kill  -9"
    runCmd(cmd)
    downloadBlocksFile().then(()=>{
        //getGenesisBlocks().then(()=>{
            cmd = "cd /breeze"
            cmd += " && sleep 2 && "
            cmd += "REBUILD_STATE=1 " + config.scriptPath + " >> " + config.logPath + " 2>&1"
            logr.info("Rebuilding state from blocks commands = ", cmd)
            runCmd(cmd)
            if (typeof cb == 'function') {
                cb()
            }
        //})
    })
}

function replayFromBreezeBackup(cb) {
    cmd = "if [[ ! `ps aux | grep -v grep | grep -v defunct | grep mongod` ]]; then `mongod --dbpath " + config.mongodbPath + " > mongo.log 2>&1 &`; fi"
    runCmd(cmd)

    cmd = "pgrep \"src/main\" | xargs --no-run-if-empty kill  -9"
    runCmd(cmd)

    var backupUrl = config.backupUrl
    cmd = "cd /breeze"
    cmd += " && "
    cmd += "if [[ ! -d \"/breeze/dump\" ]]; then `mkdir /breeze/dump`; else `rm -rf /breeze/dump/*`; fi"
    cmd += " && "
    cmd += "cd /breeze/dump"
    cmd += " && "
    downloadCmd = "wget -q --show-progress --progress=bar:force " + backupUrl + " >> " + config.replayLogPath + " 2>&1"
    cmd += "if [[ ! -f $(TZ=GMT date +'%d%h%Y_%H').tar.gz ]]; then `" + downloadCmd + "`; fi" +  " && " + "tar xfvz ./*" + " >> " +  config.replayLogPath
    cmd += " && "
    cmd += "if [[ ! `ps aux | grep -v grep | grep -v defunct | grep mongorestore` ]]; then `mongorestore -d " + db_name + " ./ >> " + config.replayLogPath + " 2>&1`; fi"
    cmd += " && "
    cmd += "cd /breeze"
    cmd += " && "
    cmd += "if [[ ! `ps aux | grep -v grep | grep -v defunct | grep src/main` ]]; then `" + config.scriptPath + " >> " + config.logPath + " 2>1&" + "`; fi"

    logr.info("Replay from database snapshot commands = ", cmd)
    runCmd(cmd)
    cb()
}

function checkHeightAndRun() {
    var url = getUrl()
    axios.get(url + '/count').then((bHeight) => {
        curbHeight = bHeight.data.count

        let dt = getCurTime()
        logr.debug("\n")
        logr.debug("Current Time = ", dt)
        logr.debug("--------------------------------------------------")
        logr.debug('Previous block height = ', prevbHeight)
        logr.debug('Current block height  = ', curbHeight)

        if(createNet) {
            if (prevbHeight == curbHeight) {
                var mineStartCmd = "curl http://localhost:3001/mineBlock"
                runCmd(mineStartCmd)
            }
        } else if (prevbHeight == curbHeight) {
            if (replayState) {
                logr.info("Replaying from database")
            } else if (rebuildState) {
                if (!fs.existsSync(genesisFilePath)) {
                    getGenesisBlocks()
                }
                logr.info("Rebuilding state from blocks")
                    mongo.init(()=> {
                        logr.info("Dropping breeze mongo db (replayState from database snapshot)")
                        mongo.dropDatabase(()=>{
                            replayAndRebuildStateFromBlocks()
                        })
                    })
            } else {
                sameHeightCount++
                if (replayCount == replayCountMax) {
                    logr.info('Replay count max reached. Rebuilding block state.')

                } else if (sameHeightCount == sameHeightThreshold && replayState == 0) {
                    sameHeightCount = 0
                    logr.info('Same block height threshold reached. Replaying from database.')
                    if (curbHeight == 0 || tryRestartForSameHeight == restartThreshold) {
                        tryRestartForSameHeight = 0
                        mongo.init(function() {
                            logr.info("Dropping breeze mongo db (replayState from database snapshot)")
                            mongo.dropDatabase(function(){
                                replayState = 1
                                replayFromBreezeBackup(function(replayCount, replayState) {
                                    replayCount++
                                    replayState = 0
                                })
                            })
                        })
                    } else {
                        // kill main and restart
                        cmd = "pgrep \"src/main\" | xargs --no-run-if-empty kill  -9"
                        runCmd(cmd)

                        logr.info("Restarting breeze with new net")
                        runBreezeScriptCmd = config.scriptPath + " >> " + config.logPath + " 2>&1"
                        runCmd(runBreezeScriptCmd)
                        tryRestartForSameHeight++
                    }
                }
            }
        } else {
            // reset all variables
            sameHeightCount = 0
            replayCount = 0
            replayState = 0
            rebuildState = 0
            replayCheck = 0
        }
        prevbHeight = curbHeight
    }).catch(() => {
        if(createNet) {
            mongo.init(function() {
                logr.info("Creating net")
                logr.info("Dropping breeze mongo db (creating new net)")
                mongo.dropDatabase(function(){
                    logr.info("Removing genesis.zip")
                    var removeGenesisCmd = "if [[ -d \"/breeze/genesis/genesis.zip\" ]]; then rm -rf /breeze/genesis; fi"
                    runCmd(removeGenesisCmd)

                    logr.info("Restarting breeze with new net")
                    runBreezeScriptCmd = config.scriptPath + " >> " + config.logPath + " 2>&1"
                    runCmd(runBreezeScriptCmd)
                });
            })
        } else {
            if (replayState == 1) {
                logr.info("Replaying from database dump.. 2nd case")
                replayCheck++
                if (replayCheck == 5000) {
                    checkRestartCmd = ""
                    restartMongoDB = "if [[ ! $(ps aux | grep -v grep | grep -v defunct | grep 'mongod --dbpath') ]]; then `mongod --dbpath " + config.mongodbPath + " > mongo.log 2>&1 &`; fi && sleep 20"
                    restartBreeze = "if [[ ! $(ps aux | grep -v grep | grep -v defunct | grep src/main) ]]; then `" + config.scriptPath + " >> " + config.logPath + " 2>1&" + "`; fi"

                    checkRestartCmd =  restartMongoDB + " && "
                    checkRestartCmd += "echo '"+mongo.getHeadBlock()+"' > tmp.out 2>&1 && a=$(cat tmp.out) && sleep 5 && echo '" + mongo.getHeadBlock() + "'> tmp2.out 2>&1 && b=$(cat tmp2.out) && sleep 30 && if [ $a == $b ]; then ` "+ restartBreeze + " `; fi"
                    logr.info("Check restart command = " + checkRestartCmd)
                    runCmd(checkRestartCmd)
                    replayState = 0
                }
            } else if(rebuildState == 1) {
                rebuildState = 0
                logr.info("Rebuilding from blocks")
                replayAndRebuildStateFromBlocks()
            } else if(process.env.REBUILD_STATE || process.env.REPLAY_STATE) {
                logr.info("Replay/Rebuild didn't start yet or finished.")
            }
        }
        if (rebuildState == 0 && replayState == 0 && ! rebuildUnfinished) {
            restartMongoDB = "if [[ ! $(ps aux | grep -v grep | grep -v defunct | grep 'mongod --dbpath') ]]; then mongod --dbpath /data/db >> /breeze/log/mongo.log 2>&1; fi"
            restartBreeze = "if [[ ! $(ps aux | grep -v grep | grep -v defunct | grep src/main) ]]; then `" + config.scriptPath + " >> " + config.logPath + " 2>1&" + "`; fi;"

            runCmd(restartMongoDB)
            if(! checkBlocksFlow()) {
                logr.warn("Restarting as we are at same block height as 5 seconds ago!")
                runCmd(restartBreeze)
            }
        }
    })
    if (rebuildState == 0 && replayState == 0)
        sleep(7000).then(() => checkHeightAndRun())
}


restartMongoDB = "if [[ ! `ps aux | grep -v grep | grep -v defunct | grep 'mongod --dbpath'` ]]; then `mongod --dbpath " + config.mongodbPath + " &`; sleep 15; fi"
restartBreeze = "if [[ ! `ps aux | grep -v grep | grep -v defunct | grep src/main` ]]; then `echo \" Restarting breeze\" >> " + config.logPath + " `; `" + config.scriptPath + " >> " + config.logPath + " 2>1&" + "`; fi"
// running first time
if (shouldGetGenesisBlocks) {
    getGenesisBlocks().then(()=>{
        runCmd(restartMongoDB)
        if(rebuildState == 0) {
            runCmd(restartBreeze)
        }
        checkHeightAndRun()
    })
} else {
    runCmd(restartMongoDB)
    if(rebuildState == 0) {
        runCmd(restartBreeze)
    }
    checkHeightAndRun()
}