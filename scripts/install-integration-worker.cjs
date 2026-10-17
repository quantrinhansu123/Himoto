/* Windows per-user startup. Does not require administrator privileges or install packages. */
const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {integrationWorkerToken}=load(path.join(root,'lib/server/integration-worker-auth'));
if(process.platform!=='win32')throw Error('This startup helper is for Windows.');
const project=path.resolve(__dirname,'..'),dir=path.join(project,'.backups','integration-worker');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({url:'https://himoto.vercel.app/api/cron/integrations',token:integrationWorkerToken()},null,2));
const startup=path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup','Himoto-integrations.vbs');
const quoted=value=>String(value).replace(/"/g,'""');
const command=`"${process.execPath}" "${path.join(project,'scripts','run-integration-sync.cjs')}"`;
const vbs=`Set runner = CreateObject("WScript.Shell")\r\nrunner.CurrentDirectory = "${quoted(project)}"\r\nrunner.Run "${quoted(command)}", 0, False\r\n`;
fs.writeFileSync(startup,vbs);
console.log(JSON.stringify({startupInstalled:true,startupFile:startup,intervalSeconds:30,credentialsInStartupFile:false}));
