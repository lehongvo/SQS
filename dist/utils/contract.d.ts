export interface MetadataInfo {
    name: string;
    description: string;
    image: string;
    attributes?: Array<{
        trait_type: string;
        value: string | number;
    }>;
}
export declare const mintNft: (metadataInfo: MetadataInfo, mintToAddress: string) => Promise<{
    hash: string;
    uri: string | null;
    tokenId: string;
    blockNumber: number;
}>;
