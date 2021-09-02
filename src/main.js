const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { create, convert } = require("xmlbuilder2");
const md5File = require("md5-file");
const ffprobe = require("ffprobe-client");
const async = require("async");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  // eslint-disable-line global-require
  app.quit();
}
let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1080,
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setIcon(path.join(__dirname, "./assets/icons/icon.ico"));

  // Used when developing locally
  const indexPathDev = url.format({
    protocol: "http:",
    host: "localhost:3000/",
    pathname: "index.html",
    slashes: true,
  });
  mainWindow.loadURL(indexPathDev);

  // Used when wanting to make a production release
  // a if check can be used later to make this automatic

  // const indexPathPro = path.join(__dirname, "./build/index.html")

  // and load the index.html of the app.
  // mainWindow.loadFile(indexPathPro);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.on("toMain", (event, { name, data }) => {
  if (name) {
    switch (name) {
      case "gen-xml":
        generateXml(data);
        break;
      case "md5":
        calculateCheckSum(data);
        break;
    }
  }
});

const generateXml = (bundleInfo) => {
  const { bundles, fileNum } = JSON.parse(bundleInfo);
  // Converts data from json to xml
  const root = create({ version: "1.0", encoding: "utf-8" })
    .ele("itv:Bundles", { "xmlns:itv": "urn:itv:metadata:20141030" })
    .txt();

  bundles.forEach((element) => {
    element.bundleCode.forEach((code) => {
      root
        .ele("itv:Bundle")
        .ele("itv:BundleCode")
        .txt(code)
        .up()
        .ele("itv:ProductionNumber")
        .txt(element.productionNumber)
        .up()
        .ele("itv:AssetDuration")
        .txt(element.assetDuration)
        .up()
        .ele("itv:ServerName")
        .txt(element.serverName)
        .up()
        .ele("itv:Source")
        .txt(element.source)
        .up()
        .ele("itv:LateAndLive")
        .txt(element.lateAndLive)
        .up()
        .ele("itv:AssetLocation")
        .txt(element.assetLocation)
        .up()
        .ele("itv:DeliveryType")
        .txt(element.deliveryType)
        .up()
        .ele("itv:DeliveryTypeVersion")
        .txt(element.deliveryTypeVersion)
        .up()
        .ele("itv:SegmentDuration")
        .txt(element.segmentDuration)
        .up()
        .ele("itv:CodingName")
        .txt(element.codingName)
        .up()
        .ele("itv:CodingProfile")
        .txt(element.codingProfile)
        .up()
        .ele("itv:AudioLineUp")
        .txt(element.audioLineUp)
        .up()
        .ele("itv:AVRenditions")
      element.avRenditions.forEach((avElement) => {
        root
          .last()
          .last()
          .ele("itv:AVRendition")
          .ele("itv:Filename")
          .txt(avElement.fileName)
          .up()
          .ele("itv:VideoAttributes")
          .ele("itv:FileChecksum")
          .txt(avElement.videoAttributes.fileChecksum)
          .up()
          .ele("itv:FileSize")
          .txt(avElement.videoAttributes.fileSize)
          .up()
          .ele("itv:PictureDefinition")
          .txt(avElement.videoAttributes.pictureDefinition)
          .up()
          .ele("itv:AspectRatio")
          .txt(avElement.videoAttributes.aspectRatio)
          .up()
          .ele("itv:Profile")
          .txt(avElement.videoAttributes.profile)
          .up()
          .ele("itv:Bitrate")
          .txt(avElement.videoAttributes.bitrate)
          .up()
          .up();
      });
    });

    const xml = root.end({ prettyPrint: true });
    const options = {
      title: "Save file",
      defaultPath: "bundleLoad.xml",
      buttonLabel: "Save",

      filters: [
        { name: "xml", extensions: ["xml"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    // write xml file
    dialog.showSaveDialog(null, options).then(({ filePath }) => {
      writeMultipleFiles(filePath,fileNum, xml)
    });
  });
};

const calculateCheckSum = (file) => {
  ffprobe(file)
    .then((data) => {
      md5File(file).then((hash) => {
        mainWindow.webContents.send(
          "fromMain",
          JSON.stringify({
            name: "md5-hash",
            hash: hash,
            bitrate: data.format.bit_rate,
            fileSize: data.format.size,
            codingName: data.streams[0].codec_name,
            aspectRatio: data.streams[0].display_aspect_ratio,
            duration: data.format.duration,
            codingProfile: data.streams[0].profile,
          })
        );
      });
    })
    .catch((err) => console.error(err));
};

const writeMultipleFiles = (filePath, NumFiles, xml) => {
  let counter = 1;
  async.until(
    (cb) => {
      cb(null, counter > NumFiles);
    },
    (cb) => {
      const multiFilePath =  filePath.substr(0,filePath.length-4) + "_" + counter + ".xml";
      fs.writeFileSync(multiFilePath, xml, function (err) {
        if (err) {
          mainWindow.webContents.send(
            "fromMain",
            "There was an error saving the file.\n" + err
          );
          return console.log(err);
        }
      });
      counter++;
      cb();
    },
    () =>{
      console.log('File Gen Complete');
 