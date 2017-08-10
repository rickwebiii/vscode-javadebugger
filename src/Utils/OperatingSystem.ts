export enum OperatingSystem {
	Windows,
	Mac,
	Linux,
	Unknown
};

export function getPlatform() {
	if (/^win/.test(process.platform)) {
		return OperatingSystem.Windows;
	} else {
		return OperatingSystem.Unknown;
	}
}