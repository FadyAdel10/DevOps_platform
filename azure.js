//upload files to azure
import { BlobServiceClient } from "@azure/storage-blob";
import { EventEmitter } from "events";
//const { Docker } = require('node-docker-api');
import { exec } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import util from "util";
import { config } from "dotenv";

config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));
const execPromise = util.promisify(exec);
const socketPath = process.platform === "win32"
    ? "//./pipe/docker_engine"
    : "/var/run/docker.sock";
const docker = new Docker({ "socketPath": socketPath });
const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING || "Default"
);

const isViteProject = async (projectPath) => {
    const fileList = await fs.promises.readdir(projectPath);
    return fileList.some((file) => file.includes('vite.config'));
};

const setProjectBuildBase = async (projectPath, buildCommand) => {
    if (await isViteProject(projectPath)) return buildCommand + " -- --base=./";

    await fs.promises.appendFile(path.join(projectPath, ".env"), "\nPUBLIC_URL=./");
    return buildCommand;
};

const setProjectBuildDir = async (projectPath) => {
    if (await isViteProject(projectPath)) return "dist";
    return "build";
};

const extract = async (zipfile, projectName) => {  
    console.log("Extracting project");
    
    const zipPath = path.join(__dirname, "uploads", zipfile.filename);
    const outputDir = path.join(__dirname, "projects", projectName);

    const unzipCommand = process.platform === "win32"
        ? `7z x "${zipPath}" -o"${outputDir}"`
        : `unzip -o "${zipPath}" -d "${outputDir}"`;

    try {
        const { stdout, stderr } = await execPromise(unzipCommand);
        console.log("Unzip output:\n", stdout);
        if (stderr) console.log(stderr);

        await fs.promises.unlink(zipPath);
        console.log("Original zip file deleted");
    } catch (error) {
        console.error("Extraction error:", error);
        throw new Error("Extraction failed");
    }
};

const promisifyStream = (stream) => new Promise((resolve, reject) => {
    stream.on("data", (data) => console.log(data.toString()));
    stream.on("end", resolve);
    stream.on("error", reject);
});

const createBuildDockerContainer = async (
    projectName,
    projectPath,
    buildCommand
) => {
    await docker.image.create(
        {},
        { fromImage: 'node:18-alpine' }
    ).then((stream) => {
        return new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
        });
    });

    const container = await docker.container.create({
        Image: 'node:18-alpine',
        name: projectName,
        Cmd: ['sh', '-c', `cd /app/${projectName} && npm install && ${buildCommand}`],
        HostConfig: {
            Binds: [`${projectPath}:/app/${projectName}`],
            AutoRemove: true
        }
    });

    await container.start();

    const stream = (await container.logs({
        follow: true,
        stdout: true,
        stderr: true
    })) as EventEmitter;

    console.log("Docker run stdout: \n");
    await promisifyStream(stream);

    await container.wait();
};

const createPublicContainer = async (containerName) => {
    try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.create({ access: "blob" });
        console.log(
            `Container "${containerName}" created successfully with public access level.`
        );
    } catch (error) {
        console.error(error);
        if (error.statusCode === 409) {
            console.log(`Container "${containerName}" already exists.`);
        } else {
            console.error(`Error creating container:`, error);
        }
    }
};

const getContentType = async (filePath) => {
    const mime = await import("mime");
    return mime.default.getType(filePath) || "application/octet-stream";
};

const uploadFileToAzure = async (containerName, filePath, blobName) => {
    try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const contentType = await getContentType(filePath);

        const uploadBlobResponse = await blockBlobClient.uploadFile(filePath, { blobHTTPHeaders: { blobContentType: contentType }, });
        console.log(`Upload successful for ${blobName}:`, uploadBlobResponse.requestId);
    } catch (error) {
        console.error(`Error uploading ${blobName}:`, error);
    }
};

const uploadFilesFromDirectory = async (containerName, directoryPath, basePath) => {
    const items = fs.readdirSync(directoryPath);

    for (const item of items) {
        const itemPath = path.join(directoryPath, item);
        const relativePath = path.relative(basePath, itemPath);

        if (fs.statSync(itemPath).isDirectory()) {
            await uploadFilesFromDirectory(containerName, itemPath, basePath);
        } else {
            const blobNameWithoutDist = relativePath.replace(/^dist\//, "");
            await uploadFileToAzure(containerName, itemPath, blobNameWithoutDist);
        }
    }
};

const deploy = async (zipfile, projectName, buildCommand) => {
    console.log("Start Deploying");

    try {
        await extract(zipfile, projectName);
        console.log("Project extraction completed");

        const projectPath = path.join(__dirname, "projects", projectName);
        const projectHostPath = path.join(process.env.HOST_PROJECTS_DIR || path.join(__dirname, "projects"), projectName);
        buildCommand = await setProjectBuildBase(projectPath, buildCommand);

        console.log("Running Container");
        await createBuildDockerContainer(projectName, projectHostPath, buildCommand);
        console.log("Finished running Container and building project");
        console.log("Container stopped and removed");

        console.log("Pushing deployment to Azure cloud");
        const builtProjectPath = path.join(projectPath, await setProjectBuildDir(projectPath));
        await createPublicContainer(projectName);
        await uploadFilesFromDirectory(projectName, builtProjectPath, builtProjectPath);
        console.log("Upload to Azure cloud finished");

        await fs.promises.rm(projectPath, { recursive: true });
        console.log("Deployment completed\nEnjoy your new website");
    } catch (error) {
        console.error("Deployment error:\n", error);
        throw new Error("Deployment failed");
    }
};

module.exports = deploy;



