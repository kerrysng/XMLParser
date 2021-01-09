var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var aws = require('aws-sdk');
var fs = require('fs');
var execSync = require('child_process').execSync;
var port = process.env.PORT || 32806;
var s3 = new aws.S3();
var parser = require('xml2json');
var moment = require('moment');

process.env.DISABLE_V8_COMPILE_CACHE = 1;


app.use(bodyParser.json());


app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


app.post('/', function (req, res) {
    console.log(req.body.ApiKey);
    console.log(req.body.Signatures);

    const TenantGUID = req.body.TenGUID
    const DocumentGUID = req.body.DocGUID;
    const data = req.body.Data;
    const signatures = req.body.Signatures;
    const TenantDir = "/tmp/" + TenantGUID;
    const S3Source = "s3://" + req.body.Document;
    const DocFile = S3Source.substring(S3Source.lastIndexOf("/") + 1, S3Source.lastIndexOf("."));
    const WorkingDirName = Math.random().toString().replace('0.', '');
    const DocDir = "/tmp/" + WorkingDirName;
    const ContentXML = DocDir + "/" + DocFile + "/word/document.xml";
    const ContentXMLsig = DocDir + "/" + DocFile + "/word/_rels/document.xml.rels";

    //Shell Commands for downloading form pack from S3
    const DownloadExtract = "mkdir --parents " + DocDir + " && aws s3 cp " + S3Source + " " + DocDir + "/" + DocFile + ".zip && cd " + DocDir + " && unzip -o " + DocFile + ".zip -d ./" + DocFile; //"mkdir --parents " + DocDir + " && aws s3 cp " + S3Source + " " + DocDir +
    ".zip && cd " + TenantDir + " && unzip -o " + DocumentGUID + ".zip -d ./" + DocumentGUID;

    const ZipConvertUpload = "cd " + DocDir + "/" + DocFile + " && zip -r " + DocFile + ".docx ./ && libreoffice6.3 --headless --convert-to pdf " + DocFile + ".docx";

    const DelTempFiles = "rm -r " + DocDir;

    console.log('req bodyyyyyyy', req.body)


    const reqKey = req.body.ApiKey
    if (reqKey != "027823aaiv0fvy0s987dfv34nhpgfi7v74871669390") {
        return res.status(700).send({
            error: err.message
        });
    } else {
        console.log('valid')
    }

    try {
        console.log(DownloadExtract);
        execSync(DownloadExtract);
    } catch (err) {
        res.status(500).send({
            error: err.message
        });
    };

    //Read the content.xml file to be processed by find and replace.
    try {
        var content = fs.readFileSync(ContentXML, "utf8");
    } catch (err) {

        res.status(600).send({
            error: err.message
        });
    }
    //Find and replace all form-tag values listed in JSON object
    try {

        Object.keys(signatures).filter(k => k.startsWith('App') || k.startsWith('Ext')).forEach(k => {
            data[k] = signatures[k];
            console.log('data keys: ', data[k])
        });

        Object.keys(signatures).filter(k => k.startsWith('AppTimestamp') || k.startsWith('ExtTimestamp')).forEach(k => {
            console.log('timestamp org values: ', signatures[k])
            const newValue = moment.unix(signatures[k]).format("DD/MM/YYYY")
            data[k] = newValue
            console.log('timestamp val: ', newValue)
        });

        for (const key in data) {
            const regexgen = new RegExp(key, "g");
            var content = content.replace(regexgen, data[key]);

        }


        if (typeof signatures !== 'undefined') {
            const newSignatures = {};

            Object.keys(signatures).filter(k => !k.startsWith('App') && !k.startsWith('Ext')).forEach(k => {
                newSignatures[k] = signatures[k];
            });
            const removeEmpty = (obj) => {
                Object.keys(obj).forEach(k => (obj[k] && typeof obj[k] === 'object') || (!obj[k] && obj[k] !== undefined) && delete obj[k]);

                return obj;
            }
            console.log(removeEmpty(newSignatures))

            console.log("new signatures:===>>>> ", newSignatures);
            var sigkeys = Object.keys(newSignatures);
            var sigvalues = Object.values(newSignatures);


            for (var e = 0, len = sigkeys.length; e < len; e++) {

                console.log('TESTING-SIGKEYS ====>' + sigkeys[e]);
                console.log('TESTING-SIGVALUES ====>' + sigvalues[e]);

                //DECLARE REFERENCE PATH (FIND) + UPDATE SOURCE HERE

                var sigkeyname = sigkeys[e].substring(sigkeys[e].indexOf("/signatures/") + 12, sigkeys[e].length);

                if (sigvalues[e] != '') {
                    const cplocalsigs = "aws s3 cp s3://" + sigvalues[e] + " " + DocDir + "/localsigs/" + sigkeyname;
                    execSync(cplocalsigs);
                }else {
                    const cplocalsigs = "file://" + DocDir + "/localsigs/" + "AppBlank1.jpg/"
                    execSync(cplocalsigs);
                }


                // FIND & REPLACE S3 bucket SIG REFERENCE to local tmp folder

                // FIND & REPLACE LOCAL SIG REFERENCE

                const newsigPath = "file://" + DocDir + "/localsigs/" + "ExtBlank1.jpg"
                const newsigPath2 = "file://" + DocDir + "/localsigs/" + "ExtBlank2.jpg"
                const appsigPath = "file://" + DocDir + "/localsigs/" + "AppBlank1.jpg/"
                const appsigPath2 = "file://" + DocDir + "/localsigs/" + "AppBlank2.jpg/"
                const appsigPath3 = "file://" + DocDir + "/localsigs/" + "AppBlank2.jpg/"

                //XML parser module
                const data = fs.readFileSync(ContentXMLsig, "utf8");
                //allows json to be converted back to XML
                let json = JSON.parse(parser.toJson(data, {
                    reversible: true
                }));
                //XML signature doc contains <relationship> tags to external resources
                var values = json["Relationships"]["Relationship"]
                //loop to find ext reference to S3 bucket and replace with local file path
                for (var i = 0; i < values.length; i++) {
                    const value = values[i]
                    // console.log('old values: ', value)
                    if (value.Target === "file:///C:\\signatures\\extparty\\ExtBlank1.jpg") {
                        value.Target = newsigPath

                    } else if (value.Target === "file:///C:\\signatures\\extparty\\ExtBlank2.jpg") {
                        value.Target = newsigPath2
                        console.log('approver sig path: ', appsigPath)

                    }else if (value.Target === "file:///C:\\signatures\\extparty\\AppBlank1.jpg") {
                        value.Target = appsigPath
                        console.log('approver sig path: ', appsigPath)

                    } else if (value.Target === "file:///C:\\signatures\\extparty\\AppBlank2.jpg") {
                        value.Target = appsigPath2
                        
                    }else if (value.Target === "file:///C:\\signatures\\extparty\\AppBlank3.jpg") {
                        value.Target = appsigPath3
                        console.log('approver sig path: ', appsigPath)

                    }
                    // console.log('new values: ', value)
                };
                //convert json to xml
                const stringified = JSON.stringify(json)
                const xml = parser.toXml(stringified);
                fs.writeFileSync(ContentXMLsig, xml, "utf8")


            };

        } else {
            console.log("No Signatures");
        };
        fs.writeFileSync(ContentXML, content, "utf8")

    } catch (err) {
        res.status(602).send({
            error: err.message
        });
    }

    //Run the final shell command
    try {
        console.log(ZipConvertUpload);
        execSync(ZipConvertUpload)

    } catch (err) {
        res.status(603).send({
            error: err.message
        });
    }

    //Set PDF path to variable
    var PDFPath = DocDir + "/" + DocFile + "/" + DocFile + ".pdf";
    console.log(PDFPath);
    //Read PDF file into memory
    try {
        var PDF = fs.readFileSync(PDFPath);
    } catch (err) {
        res.status(604).send({
            error: err.message
        });
    }


    //Convert PDF buffer into base64 and return as JSON object
    var PDF64 = PDF.toString('base64');
    var PDFres = '{"PDFDocument":"' + PDF64 + '"}'
    //Delete Temp Files
    try {
        //#execSync(DelTempFiles);
    } catch (err) {
        res.status(605).send({
            error: err.message
        });
    }

    //Return Response
    try {
        res.status(200).send(PDFres); //console.log(PDFres);//res.sendStatus(PDFres);
    } catch (err) {
        res.status(606).send({
            error: err.message
        });
    }

});

app.listen(port, function () {
    console.log('Port: ' + port);
});
