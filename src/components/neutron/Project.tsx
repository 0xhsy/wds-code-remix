import React, { useState, useEffect } from 'react';
import { Form, InputGroup, Button } from 'react-bootstrap';
import { FaSyncAlt } from 'react-icons/fa';

import { Compiler } from './Compiler';

import axios from 'axios';
import JSZip from 'jszip';
import { COMPILER_API_ENDPOINT } from '../../const/endpoint';
import { log } from '../../utils/logger';

interface InterfaceProps {
  wallet: string;
  account: string;
  providerInstance: any;
  client: any;
  providerNetwork: string;
}

export const Project: React.FunctionComponent<InterfaceProps> = ({
  providerInstance,
  wallet,
  account,
  client,
  providerNetwork,
}) => {
  const [projectName, setProjectName] = useState<string>('noname');
  const [projectList, setProjectList] = useState<string[]>([]);
  const [compileTarget, setCompileTarget] = useState<string>('');
  const [template, setTemplate] = useState<string>('counter');
  const templateList = ['counter', 'ibc_transfer'];
  const [contractAddress, setContractAddress] = useState<string>('');
  const [contractAddressInputDraft, setContractAddressInputDraft] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [contractAddressError, setContractAddressError] = useState('');

  useEffect(() => {
    getList();
  }, []);

  const getList = async () => {
    const list = await getProjectList();
    setProjectList(list);
    setCompileTarget(list[0]);
  };

  const setProject = (e: { target: { value: React.SetStateAction<string> } }) => {
    setProjectName(e.target.value);
  };

  const setTarget = (e: { target: { value: React.SetStateAction<string> } }) => {
    setCompileTarget(e.target.value);
  };

  const setTargetTemplate = (e: { target: { value: React.SetStateAction<string> } }) => {
    setTemplate(e.target.value);
  };

  const createProject = async () => {
    if (await isExists(projectName)) {
      await client.terminal.log({
        type: 'error',
        value:
          'The folder "neutron/' +
          projectName +
          '" already exists. Please delete the existing project.',
      });
      return;
    }

    try {
      const path = 'browser/neutron/' + projectName;
      await client?.fileManager.mkdir(path + '/src');
      await client?.fileManager.mkdir(path + '/examples');
      await client?.fileManager.writeFile(path + '/examples/schema.rs', '');
      await client?.fileManager.writeFile(path + '/Cargo.toml', '');
      await getList();
      await client.terminal.log({
        type: 'info',
        value: projectName + ' is created successfully.',
      });
    } catch (e: any) {
      console.error(e);
      await client.terminal.log({
        type: 'error',
        value: e.message,
      });
    }
  };

  const getProjectList = async () => {
    try {
      const list = await client?.fileManager.readdir('browser/neutron/');
      return Object.keys(list || []);
    } catch (e) {
      log.error(e);
    }
    return [];
  };

  const isExists = async (dir: string): Promise<boolean> => {
    try {
      const read: object = await client.fileManager.readdir('browser/neutron/' + dir);
      return Object.keys(read).length > 0;
    } catch (e) {
      log.error(e);
      return false;
    }
  };

  const createTemplate = async () => {
    log.debug('create ' + template);

    if (await isExists(template)) {
      await client.terminal.log({
        type: 'error',
        value:
          'The folder "neutron/' +
          template +
          '" already exists. Please delete the existing project.',
      });
      return;
    }

    const res = await axios.request({
      method: 'GET',
      url:
        `${COMPILER_API_ENDPOINT}/s3Proxy?bucket=code-template&fileKey=neutron/` +
        template +
        '.zip',
      responseType: 'arraybuffer',
      responseEncoding: 'null',
    });

    log.debug(res);

    const jsZip = new JSZip();
    const zip = await jsZip.loadAsync(res.data);

    log.debug(zip);
    try {
      Object.keys(zip.files).map(async (key) => {
        if (zip.files[key].dir) {
          await client?.fileManager.mkdir('browser/neutron/' + key);
        } else if (!key.startsWith('_') && key !== template + '/.DS_Store') {
          const content = await zip.file(key)?.async('string');
          await client?.fileManager.writeFile('browser/neutron/' + key, content);
        }
      });
      await getList();
      await client?.terminal.log({
        type: 'info',
        value: template + ' is created successfully.',
      });
    } catch (e: any) {
      console.error(e);
      await client.terminal.log({
        type: 'error',
        value: e.message,
      });
    }
  };

  // Need not this function now
  // const getContractAtAddress = () => {
  //   if (contractAddressInputDraft.slice(0, 4) !== 'neutron') {
  //     setContractAddressError('Invalid contract address');
  //     return;
  //   }
  //   setContractAddress(contractAddressInputDraft);
  // };

  const reset = () => {
    setContractAddress('');
    setContractAddressInputDraft('');
    setContractAddressError('');
  };

  return (
    <div className="pb-4">
      <Form>
        <Form.Group style={mt8}>
          <Form.Text className="text-muted mb-1">
            <small>NEW PROJECT</small>
          </Form.Text>
          <InputGroup>
            <Form.Control type="text" placeholder="Project Name" size="sm" onChange={setProject} />
            <Button variant="success" size="sm" onClick={createProject}>
              <small>Create</small>
            </Button>
          </InputGroup>
        </Form.Group>
        <Form.Group style={mt8}>
          <Form.Text className="text-muted" style={mb4}>
            <small>SELECT A TEMPLATE</small>
          </Form.Text>
          <InputGroup>
            <Form.Control
              className="custom-select"
              as="select"
              value={template}
              onChange={setTargetTemplate}
            >
              {templateList.map((temp, idx) => {
                return (
                  <option value={temp} key={idx}>
                    {temp}
                  </option>
                );
              })}
            </Form.Control>
            <Button variant="success" size="sm" onClick={createTemplate}>
              <small>Create</small>
            </Button>
          </InputGroup>
        </Form.Group>
        <Form.Group style={mt8}>
          <Form.Text className="text-muted" style={mb4}>
            <small>TARGET PROJECT </small>
            <span onClick={getList}>
              <FaSyncAlt />
            </span>
          </Form.Text>
          <InputGroup>
            <Form.Control
              className="custom-select"
              as="select"
              value={compileTarget}
              onChange={setTarget}
            >
              {projectList.map((projectName, idx) => {
                return (
                  <option value={projectName} key={idx}>
                    {projectName}
                  </option>
                );
              })}
            </Form.Control>
          </InputGroup>
        </Form.Group>
      </Form>
      <Compiler
        fileName={fileName}
        setFileName={setFileName}
        providerInstance={providerInstance}
        compileTarget={compileTarget}
        wallet={wallet}
        account={account}
        client={client}
        reset={reset}
        providerNetwork={providerNetwork}
      />

      {/* need not this 'at address' feature */}
      {/* {!fileName ? (
        <>
          <Form.Group>
            <InputGroup>
              <Form.Control
                type="text"
                placeholder="Contract Address"
                size="sm"
                value={contractAddressInputDraft}
                onChange={(e) => {
                  setContractAddress('');
                  setContractAddressInputDraft(e.target.value);
                  setContractAddressError('');
                }}
                spellCheck={false}
              />
              <OverlayTrigger
                placement="top"
                overlay={<Tooltip id="overlay-ataddresss">Use deployed Contract Address</Tooltip>}
              >
                <Button
                  variant="info"
                  size="sm"
                  disabled={account === ''}
                  onClick={getContractAtAddress}
                  className="mb-2"
                >
                  <small>At Address</small>
                </Button>
              </OverlayTrigger>
            </InputGroup>
          </Form.Group>
          {contractAddressError && <div style={{ color: 'red' }}>{contractAddressError}</div>}
        </>
      ) : (
        false
      )}
       */}
      {/* {!fileName && contractAddress && !contractAddressError ? (
        <Contract contractAddress={contractAddress || ''} />
      ) : (
        false
      )} */}
    </div>
  );
};

const mt8 = {
  marginTop: '8px',
};

const mb4 = {
  marginBottom: '4px',
};
