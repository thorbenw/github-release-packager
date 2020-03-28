/**
 * Valid update operations.
 */
export type UpdateOperation = number;
export var UpdateOperation: {
    /** Default operation, updating items as needed. */
    default: number;
    /**
     * Check if updates are needed, but do not actually update anything.
     *
     * ---
     * Emits warnings, if an update is needed!
     */
    checkonly: number;
    /** Update items, even if unnecessary. */
    force: number;
};
export function UpdateBinary(options?: UpdateOptions, version?: string, plugin?: GitHubReleasePackagerPlugin): Promise<void>;
export function UpdateBinarySync(options?: UpdateOptions, version?: string, plugin?: GitHubReleasePackagerPlugin): void;
export function UpdatePackage(options?: UpdateOptions): Promise<void>;
export function UpdatePackageSync(options?: UpdateOptions): void;
export function GetLatestReleaseURL(owner: string, repository: string): Promise<string>;
export function GetLatestReleaseURLSync(owner: string, repository: string): string;
export function GetNPMVersion(version: string, overlapFactor?: number): string;
export function GetExecutable(binname: string, options?: UpdateOptions): string;
export type GitHubRepository = {
    owner: string;
    name: string;
};
export type GitHubReleaseDownloadURLCallback = (repository: GitHubRepository, version: string) => Promise<string>;
export type GitHubReleaseProcessBinaryCallback = (file: string, folder: string) => Promise<void>;
export type GitHubReleaseBinariesCallback = (repository: GitHubRepository, version: string, folder: string) => Promise<any>;
export type GitHubReleasePackagerPlugin = {
    downloadURL?: GitHubReleaseDownloadURLCallback;
    processBinary?: GitHubReleaseProcessBinaryCallback;
    binaries?: GitHubReleaseBinariesCallback;
};
export type UpdateOptions = {
    /**
     * The operation mode
    (see {@link module:packager~UpdateOperation})
     */
    operation?: number;
    /**
     * The folder path to search for the package
    file (defaults to the path of the first caller outside of the packager module
    if omitted).
     */
    packagePath?: string;
    /**
     * The folder path to search for the package
    file (defaults to `package.json` if omitted).
     */
    packageFile?: string;
};
export type Package = {
    packageJson: any;
    packageFileName: string;
};
