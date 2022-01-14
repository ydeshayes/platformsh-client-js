import parse_url from "parse_url";

import _urlParser from "../urlParser";
import { makeAbsoluteUrl, getRef, getRefs, hasLink, getLink } from "../refs";
import request from "../api";
import Result from "./Result";

const handler = {
  get(target: any, key: string) {
    if (
      typeof key !== "symbol" &&
      !key.startsWith("_") &&
      key !== "data" &&
      target.hasOwnProperty(key)
    ) {
      return target.data && target.data[key];
    }

    return target[key];
  },
  set(target: any, key: string, value: any) {
    if (key !== "data" && target.hasOwnProperty(key)) {
      target.data[key] = value;
      return true;
    }

    target[key] = value;
    return true;
  }
};

interface link {
  href: string
}

interface APIObject {
  [key: string]: any,
  id: string,
  _links?: Record<string, link>,
  _embedded?: Record<string, Array<object>>
};

const pick = (data: any, fields: string[]) => {
  return Object.keys(data)
    .filter(k => fields.indexOf(k) !== -1)
    .reduce<object>((acc: any, k: string) => {
      acc[k] = data[k];

      return acc;
    }, 
    {});
};

export default abstract class Ressource {
  protected _url: string;
  protected _params: object;
  protected _baseUrl?: string;
  protected _creatableField: string[];
  protected _modifiableField: string[];
  protected _paramDefaults: object;
  protected _required?: string[];
  protected _queryUrl?: string;

  private data?: APIObject;

  constructor(
    _url: string,
    paramDefaults: object,
    params: object,
    data: APIObject,
    _creatableField: string[] = [],
    _modifiableField: string[] = []
  ) {
    // This is an abstract class
    if (this.constructor === Ressource) {
      throw new Error("Can't instantiate abstract class");
    }

    this.copy(data);

    const url = _url || this.getLink("self");
    this._params = params;

    this._url = _urlParser(url, params, paramDefaults);
    const parsedUrl = parse_url(url);

    if (parsedUrl[1] === "http" || parsedUrl[1] === "https") {
      this._baseUrl = `${parsedUrl[1]}:${parsedUrl[2]}${parsedUrl[3]}${
        parsedUrl[4] ? `:${parsedUrl[4]}` : ""
      }`;
    }
    this._creatableField = _creatableField;
    this._modifiableField = _modifiableField;
    this._paramDefaults = paramDefaults;

    return new Proxy(this, handler);
  }

  static getQueryUrl(_url = "") {
    return _url.substring(0, _url.lastIndexOf("/"));
  }

  static _get(_url: string, params?: object, paramDefaults?: object, queryParams?: object, options?: object): object {
    const parsedUrl = _urlParser(_url, params, paramDefaults);

    return request(parsedUrl, "GET", queryParams, {}, 0, options).then((data: object) => {
      return typeof data === "undefined"
        ? undefined
        : new (this.prototype as any).constructor(data, parsedUrl, params);
    });
  }

  static _query(
    _url: string,
    params?: object,
    paramDefaults?: object,
    queryParams?: object ,
    transformResultBeforeMap? : (data: Array<APIObject>) => Array<APIObject>,
    options?:  object // Define that in api
  ) {
    const parsedUrl = _urlParser(_url, params, paramDefaults);

    return request(parsedUrl, "GET", queryParams, {}, 0, options).then((data: Array<APIObject>) => {
      let dataToMap = data;
      if (transformResultBeforeMap) {
        dataToMap = transformResultBeforeMap(data);
      }

      return dataToMap.map(
        (d: APIObject) => new (this.prototype as any).constructor(d, `${parsedUrl}/${d.id}`)
      );
    });
  }

  checkProperty(property: string, value: any): object {
    return {};
  }

  /**
   * Validate values for update.
   *
   * @param array values
   *
   * @return string{} An object of validation errors.
   */
  checkUpdate(values : {[key: string]: any} = {}) {
    let errors: object = {};

    
    //checkProperty can be overrided by children
    for (let key in Object.keys(values)) {
      errors =  this.checkProperty(key, values[key]);
    }
    return Object.keys(errors).length ? errors : undefined;

  }

  update(data: APIObject, _url: string) {
    if (!this._modifiableField.length) {
      throw new Error("Can't call update on this ressource");
    }

    const errors = this.checkUpdate(this.data);

    if (errors) {
      return Promise.reject(errors);
    }
    let updateLink;

    try {
      updateLink = this.getLink("#edit", true);
    } catch (err) {
      if (!_url) {
        throw new Error("Not allowed to edit");
      }
    }

    if (!updateLink) {
      updateLink = _urlParser(
        _url || this._url,
        this.data,
        this._paramDefaults
      );
    }

    return request(updateLink, "PATCH", pick(data, this._modifiableField)).then(
      (data: object) => {
        return new Result(data, this._url, this.constructor);
      }
    );
  }

  updateLocal(data: object) {
    return new (this.constructor as any)({ ...this.data, ...data }, this._url);
  }

  /**
   * Get the required properties for creating a new resource.
   *
   * @return array
   */
  getRequired() {
    return this._required || [];
  }

  /**
   * Validate a new resource.
   *
   * @param array data
   *
   * @return string{} An object of validation errors.
   */
  checkNew(values: {
    [key: string]: any
  } = {}) {
    let errors: { [key: string] : string } = {};
    const dataKeys = Object.keys(values);

    const missing = this.getRequired().filter(function(i) {
      return dataKeys.indexOf(i) < 0;
    });

    if (missing.length) {
      errors._error = `Missing ${missing.join(", ")}`;
    }

    for (let i = 0; i < dataKeys.length; i++) {
      const key = dataKeys[i];

      errors = { ...errors, ...this.checkProperty(key, values[key]) };
    }

    return Object.keys(errors).length ? errors : undefined;
  }

  save() {
    if (!this._creatableField.length) {
      throw new Error("Can't call save on this ressource");
    }
    
    const errors = this.checkNew(this.data);
    if (errors) {
      return Promise.reject(errors);
    }
    const url = this._queryUrl || this._url;
    
    return request(url, "POST", pick(this.data, this._creatableField)).then(
      (data: object) => {
        return new Result(data, url, this.constructor);
      }
    );
  }

  delete(url: string) {
    const deleteLink = url || this.getLink("#delete");

    if (!deleteLink) {
      throw new Error("Not allowed to delete");
    }
    return request(deleteLink, "DELETE", {}).then(
      (result: object) => new Result(result, this._url, this.constructor)
    );
  }

  copy(data: APIObject) {
    this.data = { ...this.data, ...data };
  }

  static wrap(objs: object[]) {
    return objs.map(
      (obj) => {
        return new (this.prototype as any).constructor(obj)
      }
    );
  }

  /**
   * Refresh the resource.
   *
   */
  refresh(params: object) {
    return request(this.getUri(), "GET", params).then((data: APIObject) => {
      this.copy(data);
      return this;
    });
  }

  /**
   * Check whether an operation is available on the resource.
   *
   * @param {string} operationName
   *
   * @return {boolean} true if the operation is available false otherwise
   */
  operationAvailable(operationName: string) {
    const links = this.data?._links;
    const operation = links && links[`#${operationName}`];
    return operation?.href;
  }

  /**
   * Check whether the resource has a link.
   *
   * @param rel
   *
   * @return bool
   */
  hasLink(rel: string): boolean {
    return hasLink(this.data?._links, rel);
  }

  /**
   * Check whether the resource has an embedded.
   *
   * @param rel
   *
   * @return bool
   */
  hasEmbedded(rel: string) {
    return (
      this.data?._embedded &&
      this.data._embedded[rel] &&
      !!this.data._embedded[rel].length
    );
  }

  /**
   * Get a embedded for a given resource relation.
   *
   * @param string rel
   *
   * @return array
   */
  getEmbedded(rel: string) {
    if (!this.hasEmbedded(rel)) {
      throw new Error(`Embedded not found: ${rel}`);
    }

    return this.data?._embedded && this.data._embedded[rel];
  }

  /**
   * Get a link for a given resource relation.
   *
   * @param string rel
   * @param bool absolute
   *
   * @return string
   */
  getLink(rel: string, absolute: boolean = true) {
    return getLink(this.data?._links, rel, absolute, this._baseUrl);
  }

  /**
   * Get the resource's URI.
   *
   * @param bool absolute
   *
   * @return string
   */
  getUri(absolute = true) {
    return this.getLink("self", absolute);
  }

  /**
   * Make a URL absolute, based on the base URL.
   *
   * @param string relativeUrl
   * @param string _baseUrl
   *
   * @return string
   */
  makeAbsoluteUrl(relativeUrl: string, _baseUrl: string | undefined = this._baseUrl) {
    return makeAbsoluteUrl(`${_baseUrl}${relativeUrl}`, _baseUrl);
  }

  /**
   * Execute an operation on the resource.
   *
   * @param string op
   * @param string method
   * @param array  body
   *
   * @return array
   */
  runOperation(op: string, method = "POST", body: object) {
    if (!this.operationAvailable(op)) {
      throw new Error(`Operation not available: ${op}`);
    }
    return request(this.getLink(`#${op}`), method, body);
  }

  /**
   * Run a long-running operation.
   *
   * @param string op
   * @param string method
   * @param array  body
   *
   * @return Activity
   */
  runLongOperation(op: string, method = "POST", body: object) {
    return this.runOperation(op, method, body).then((data: object) => {
      const result = new Result(data, this.getUri());
      const activities = result.getActivities();

      if (activities.length !== 1) {
        throw new Error(`Expected one activity, found ${activities.length}`);
      }

      return activities[0];
    });
  }

  hasPermission(permission: string) {
    return this.data?._links && !!this.data._links[permission];
  }

  // Load a single object from the ref API
  getRef(linkKey: string, constructor: Function, absolute = true) {
    return getRef(
      this.data?._links,
      linkKey,
      constructor,
      absolute,
      this._baseUrl
    );
  }

  // Load a list of objects from the ref API
  async getRefs(linkKey: string, constructor: Function, absolute = true) {
    return getRefs(
      this.data?._links,
      linkKey,
      constructor,
      absolute,
      this._baseUrl
    );
  }
}
