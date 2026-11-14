// Core release tests use fixtures only, even when local .env files are present.
// Legacy fixture suites select their provider explicitly; object-media tests
// opt into CloudFly themselves rather than inheriting production .env settings.
process.env.PHOTO_STORAGE_PROVIDER ||= 'cloudinary';
process.env.MEDIA_ARCHIVE_ENABLED ||= 'off';
function blocked(){throw Error('Core release tests must not access external services');}
for(const name of ['node:http','node:https']){const mod=require(name);mod.request=blocked;mod.get=blocked;}
const net=require('node:net');net.connect=blocked;net.createConnection=blocked;net.Socket.prototype.connect=blocked;
require('node:tls').connect=blocked;
global.fetch=async()=>blocked();
