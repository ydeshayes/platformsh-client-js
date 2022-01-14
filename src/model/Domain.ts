import Ressource from "./Ressource";
import { getConfig } from "../config";

const paramDefaults = {};
const _url = "/projects/:projectId/domains";

export interface DomainGetParams {
  name: string
};

export interface DomainQueryParams {
  [index: string]: any;
  projectId: string;
}

export default class Domain extends Ressource {
  id: string;
  name:string;

  constructor(domain: Domain, url: string) {
    super(url, paramDefaults, {}, domain, ["name", "ssl"]);
    this.id = "";
    this.name = "";
    this._required = ["name"];
  }

  static get(params: DomainGetParams, customUrl: string) {
    const { name, ...queryParams } = params;
    const { api_url } = getConfig();

    return super._get(
      customUrl ? `${customUrl}/:name` : `${api_url}${_url}`,
      { name },
      paramDefaults,
      queryParams
    );
  }

  static query(params: DomainQueryParams, customUrl: string) {
    const { projectId, ...queryParams } = params;
    const { api_url } = getConfig();

    return super._query(
      customUrl || `${api_url}${_url}`,
      { projectId },
      paramDefaults,
      queryParams
    );
  }
}
