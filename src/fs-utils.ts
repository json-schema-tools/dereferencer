import { FSLoader } from "./dereferencer";

export const fileExistsAndReadable = (fs: FSLoader, f: string): Promise<boolean> => {
  return new Promise((resolve) => {
    return fs.access(f, fs.constants.F_OK | fs.constants.R_OK, (e) => { //tslint:disable-line
      if (e) { return resolve(false); }
      return resolve(true);
    });
  });
};

export const readFile = (fs: FSLoader, f: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    return fs.readFile(f, "utf8", (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
};

export default { fileExistsAndReadable, readFile };
