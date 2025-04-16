declare class AttributeDto {
    trait_type: string;
    value: string | number;
}
export declare class MintNftDto {
    name: string;
    description: string;
    image: string;
    mintToAddress: string;
    attributes?: AttributeDto[];
}
export {};
