interface Configuration {
    chromePath?: string;
    browserDataPath: string;
    headless: boolean;
    excludeFetched: boolean;
}

export const Config: Configuration = JSON.parse(await Deno.readTextFile(Deno.args[0]))