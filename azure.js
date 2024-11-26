import { BlobServiceClient } from "@azure/storage-blob";
import mime from "mime-types";
import fs from "fs";
import path from "path";

const blobService = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING || "Default"
);
async function createContainer(containerName) {
  const containerClient = blobService.getContainerClient(containerName)

  const createContainerResponse = await containerClient.create({
    access: "container"
  })

  console.log(`Create container ${containerName} successfully`, createContainerResponse.requestId)
}

async function doesContainerExist(containerName) {
  const containerClient = blobService.getContainerClient(containerName)

  return await containerClient.exists()
}

async function emptyContainer(containerName) {
  const containerClient = blobService.getContainerClient(containerName)

  for await (const blob of containerClient.listBlobsFlat()) {
    await containerClient.deleteBlob(blob.name)
  }

  console.log(`Emptied container ${containerName}`)
}

async function uploadFilesFromDirectory(containerName, directoryPath, basePath) {
  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const relativePath = path.relative(basePath, filePath);

    if (fs.lstatSync(filePath).isDirectory()) {
      await uploadFilesFromDirectory(containerName, filePath, basePath);
    } else {
      const blobName = relativePath;
      await uploadFileToContainer(containerName, blobName, filePath);
    }

  }
}

async function uploadFileToContainer(containerName, blobName, filePath) {
  const containerClient = blobService.getContainerClient(containerName)
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)

  const mimeType = mime.lookup(blobName) || "application/octet-stream"; // Default if MIME type is not found
  const uploadBlobResponse = await blockBlobClient.uploadFile(filePath, {
    blobHTTPHeaders: {
      blobContentType: mimeType,
    },
  })

  console.log(`Upload block blob ${blobName} successfully`, uploadBlobResponse.requestId)
}


export const AzureService = {
  createContainer,
  doesContainerExist,
  uploadFilesFromDirectory,
  emptyContainer
}

async function testAzure() {
  const containerName = "project1";
  console.log("Checking if container exists...")

  if (await AzureService.doesContainerExist(containerName)) {
    console.log("Container already exists")
    await AzureService.emptyContainer(containerName)
    console.log("Container emptied")
  } else {
    console.log("Creating container...")
    await AzureService.createContainer(containerName)
  }
  const testDirectoryPath = "/Users/abdelrahman/projects/learn_html"
  await AzureService.uploadFilesFromDirectory(containerName, testDirectoryPath, testDirectoryPath)
  console.log(`Uploaded files to ${containerName}`)
}


testAzure();



