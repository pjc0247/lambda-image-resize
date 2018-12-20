'use strict';

const http = require('https');
const sharp = require('sharp');
const im = require('imagemagick')
    , aws = require('aws-sdk')
    , s3 = new aws.S3({ apiVersion: '2006-03-01', region: 'ap-northeast-2' }) // Setup S3 region
    , sizes = [196, 1024] // Add more image size to resize
    , debug = true; // Turn off debug flag on production mode

const BaseUrl = "";
const UserLambdaHost = "unq1g3g289.execute-api.ap-northeast-2.amazonaws.com";
const SetProfileImagePath = "";

var uid = "";
var key = "";
var rotation = 0;

if (!debug) {
    console.log = () => {};
    console.error = () => {};  
}  

function getObject(params) {
    console.log('getObject() params', params);
    return new Promise((resolve, reject) => {
        s3.getObject(params, (err, data) => {
            if (err)  reject(err);
            else {
                return resolve({
                    Bucket: params.Bucket,
                    Key: params.Key,
                    ContentType: data.ContentType,
                    Body: data.Body
                });
            }
        });
    });
}

function resize(params) {
    console.log('resize() params', params);
    let tasks = sizes.map(size => {
        return new Promise((resolve, reject) => {
            const p = {
                srcData: params.Body,
                width: size
            };    

            sharp(params.Body)
                .resize(p.width)
                .max()
                .toFormat('jpeg')
                .toBuffer()
                .then(function(outputBuffer) {
                    let key = params.Key.replace('.jpg', '_' + (p.width == 196 ? 'thumbnail' : 'large') + '.jpg');
                    if (p.width == 196)
                        key = params.Key;
                    resolve({
                        Bucket: params.Bucket,
                        Key: key,
                        ContentType: params.ContentType,
                        ACL: 'public-read',
                        Body: ( Buffer.isBuffer(outputBuffer) ) ? outputBuffer : new Buffer(outputBuffer, "binary")
                    });
                })
                .catch(function(e) {
                    reject(e);
                });
        });
    });

    console.log('resize() tasks', tasks);
    return Promise.all(tasks);
}

function putObject(params) {
    console.log('putObject() params', params);
    let tasks = params.map(param => {
        return new Promise((resolve, reject) => {
           s3.putObject(param, (err, data) => {
               if (err)  reject(err);
               else {
                 resolve(data);
               }
           });
        });    
    });
    console.log('putObject() tasks', tasks)
    return Promise.all(tasks);
}

function requestApplyDB(params) {
    console.log("requestApplyDB() params", params);
    
    if (uid == null)
        return new Promise((resolve, reject) => {
           resolve(params); 
        });
    
    return new Promise((resolve, reject) => {
        var post_options = {
          host: UserLambdaHost,
          port: '443',
          path: SetProfileImagePath,
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          }
        };
    
        var post_req = http.request(post_options, function(res) {
            var body = "";
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                resolve(JSON.parse(body));
            });
        });
    
        post_req.write(JSON.stringify({
                "uid": uid,
                "rotation": rotation,
                "credential": "zhuzhu300",
                "profile_image": BaseUrl + key.replace('.jpg', '_thumbnail.jpg'),
                "profile_image_large": BaseUrl + key.replace('.jpg', '_large.jpg')
            }));
        post_req.end();
    });
}

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const params = {
        Bucket: event.Records[0].s3.bucket.name,
        Key: event.Records[0].s3.object.key
    };
    key = p.key;
    rotation = p.rotation;
    
    Promise.resolve(params)
        .then(getObject)
        .then(resize)
        .then(putObject)
        .then(result => {
            console.log(result);
            callback(null, {
                'statusCode': 200,
                'headers': {},
                'body': JSON.stringify({
                    "result" : {
                        "large_url": BaseUrl + params.Key.replace('.jpg', '_thumbnail.jpg'),
                        "thumbnail_url": BaseUrl + params.Key.replace('.jpg', '_large.jpg')
                    }
                })});
        })
        .catch(err => {
            console.error(err);
            callback(null, {
                'statusCode': 500,
                'headers': {},
                'body': JSON.stringify({
                    "result" : err
                })});
        });
};