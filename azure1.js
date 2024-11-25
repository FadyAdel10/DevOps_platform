import { BlobServiceClient } from "@azure/storage-blob";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

config();

// Initialize Azure Blob Service Client
const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING || "Default"
);

// Get MIME type of a file
const getContentType = async (filePath) => {
    const mime = await import("mime");
    return mime.default.getType(filePath) || "application/octet-stream";
};

// Create an Azure container if it doesn't exist
const createPublicContainer = async (containerName) => {
    try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.create({ access: "blob" });
        console.log(`Container "${containerName}" created successfully with public access level.`);
    } catch (error) {
        if (error.statusCode === 409) {
            console.log(`Container "${containerName}" already exists.`);
        } else {
            console.error(`Error creating container:`, error);
        }
    }
};

// Upload a single file to Azure
const uploadFileToAzure = async (containerName, filePath, blobName) => {
    try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const contentType = await getContentType(filePath);

        const uploadBlobResponse = await blockBlobClient.uploadFile(filePath, {
            blobHTTPHeaders: { blobContentType: contentType },
        });
        console.log(`Uploaded "${blobName}" successfully:`, uploadBlobResponse.requestId);
    } catch (error) {
        console.error(`Error uploading "${blobName}":`, error);
    }
};

// Upload all files in the folder to Azure
const uploadFolderToAzure = async (folderPath) => {
    try {
        const folderName = path.basename(folderPath);
        console.log(`Preparing to upload files from "${folderPath}" to Azure container "${folderName}".`);

        // Create container (if it doesn't already exist)
        await createPublicContainer(folderName);

        // Recursively upload files
        const uploadFilesRecursively = async (directoryPath, basePath) => {
            const items = fs.readdirSync(directoryPath);

            for (const item of items) {
                const itemPath = path.join(directoryPath, item);
                const relativePath = path.relative(basePath, itemPath);

                if (fs.statSync(itemPath).isDirectory()) {
                    await uploadFilesRecursively(itemPath, basePath);
                } else {
                    await uploadFileToAzure(folderName, itemPath, relativePath);
                }
            }
        };

        await uploadFilesRecursively(folderPath, folderPath);
        console.log(`All files from "${folderPath}" uploaded to Azure container "${folderName}".`);
    } catch (error) {
        console.error("Error uploading folder to Azure:", error);
    }
};
// Delete an Azure container by name
const deleteContainer = async (containerName) => {
    try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const deleteResponse = await containerClient.delete();
        console.log(`Container "${containerName}" deleted successfully:`, deleteResponse.requestId);
    } catch (error) {
        if (error.statusCode === 404) {
            console.error(`Container "${containerName}" does not exist.`);
        } else {
            console.error(`Error deleting container "${containerName}":`, error);
        }
    }
};

// Example Usage
const containerNameToDelete = "user1"; // Replace with the name of the container to delete
deleteContainer(containerNameToDelete);

// Example Usage
const hostFolderPath = "/home/somaya/projects/user1"; // Replace with the path to your host folder
//uploadFolderToAzure(hostFolderPath);
