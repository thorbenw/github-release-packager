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
export function GetDefaultPlugin(force?: boolean): GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin;
export function UpdateBinary(options?: UpdateOptions, version?: string, plugin?: GitHubReleasePackagerPlugin): Promise<void>;
export function UpdateBinarySync(options?: UpdateOptions, version?: string, plugin?: GitHubReleasePackagerPlugin): void;
export function UpdatePackage(options?: UpdateOptions): Promise<void>;
export function UpdatePackageSync(options?: UpdateOptions): void;
export function GetLatestReleaseURL(owner: string, repository: string): Promise<string>;
export function GetLatestReleaseURLSync(owner: string, repository: string): string;
export function GetExecutable(binname: string, options?: UpdateOptions): string;
export type SectionPart = string | number;
export type VersionSection = (string | number)[];
export type Version = {
    /**
     * The release part of a version.
     */
    Release: (string | number)[];
    /**
     * The prerelease part of a version.
     */
    Prerelease: (string | number)[];
    /**
     * The build metadata part of a version.
     */
    BuildMetadata: (string | number)[];
};
export type GitHubRepository = {
    owner: string;
    name: string;
};
export type GitHubReleasePackagerDownloadURLCallback = (repository: GitHubRepository, version: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<string>;
export type GitHubReleasePackagerSemverCallback = (version: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<string>;
export type GitHubReleasePackagerProcessBinaryCallback = (file: string, folder: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<void>;
export type GitHubReleasePackagerPostProcessCallback = (repository: GitHubRepository, version: string, folder: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<any>;
export type GitHubReleasePackagerPlugin = {
    Name: string;
    getDownloadURL?: GitHubReleasePackagerDownloadURLCallback;
    getSemver?: GitHubReleasePackagerSemverCallback;
    processBinary?: GitHubReleasePackagerProcessBinaryCallback;
    postProcess?: GitHubReleasePackagerPostProcessCallback;
};
export type GitHubReleasePackagerParseVersionCallback = (version: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<Version>;
export type GitHubReleasePackagerParseSectionCallback = (section: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<(string | number)[]>;
export type GitHubReleasePackagerGetSectionStringCallback = (section: string, defaultPlugin: GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin) => Promise<string>;
export type GitHubReleasePackagerExtendedPlugin = {
    ParseVersion: GitHubReleasePackagerParseVersionCallback;
    ParseSection: GitHubReleasePackagerParseSectionCallback;
    GetSectionString: GitHubReleasePackagerGetSectionStringCallback;
};
export type GitHubReleasePackagerDefaultPlugin = GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin;
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
