import { Pagination, Table } from '@heroui/react';
import React from 'react';

export const TableWrapper = ({ children }: { children?: React.ReactNode }) => {
  //@ts-ignore
  const parseTableData = () => {
    if (!children) {
      return { headers: [], rows: [] };
    }

    const childrenArray = React.Children.toArray(children);
    if (childrenArray.length < 2) {
      return { headers: [], rows: [] };
    }

    const [thead, tbody] = childrenArray;
    //@ts-ignore
    const headers = thead?.props?.children?.props?.children
      ? //@ts-ignore
        React.Children.toArray(thead.props.children.props.children).map((th: any) => th.props?.children || '')
      : [];
    //@ts-ignore
    const rows = tbody?.props?.children
      ? //@ts-ignore
        React.Children.toArray(tbody.props.children).map((tr: any) =>
          React.Children.toArray(tr.props?.children || []).map((td: any) => td.props?.children || '')
        )
      : [];

    return { headers, rows };
  };

  const { headers, rows } = parseTableData();

  if (headers.length === 0 || rows.length === 0) {
    return (
      <div className="w-full my-4">
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Empty table">
              <Table.Header>
                <Table.Column isRowHeader={true}>No Data</Table.Column>
              </Table.Header>
              <Table.Body>
                <Table.Row>
                  <Table.Cell>No data available</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </div>
    );
  }

  const [page, setPage] = React.useState(1);
  const rowsPerPage = 10;

  const pages = Math.ceil(rows.length / rowsPerPage);
  const start = (page - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const currentRows = rows.slice(start, end);
  const windowStart = Math.max(2, Math.min(page - 1, pages - 4));
  const windowEnd = Math.min(pages - 1, Math.max(page + 1, 5));
  const pageNumbers = pages <= 7
    ? Array.from({ length: pages }, (_, index) => index + 1)
    : [1, ...Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index), pages];

  return (
    <div className="w-full">
      <Table className="my-4 overflow-y-scroll w-full">
        <Table.ScrollContainer>
          <Table.Content aria-label="Markdown table">
            <Table.Header>
              {headers.map((header, index) => (
                <Table.Column key={`header-${index}`} isRowHeader={index === 0}>
                  {header}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body>
              {currentRows.map((row, rowIndex) => (
                <Table.Row key={`row-${rowIndex}`} className="even:bg-default-100">
                  {row.map((cell, cellIndex) => (
                    <Table.Cell key={`cell-${rowIndex}-${cellIndex}`}>{cell}</Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {pages > 1 && (
        <div className="flex justify-center my-4">
          <Pagination>
            <Pagination.Content>
              {pageNumbers.map((pageNumber, index) => (
                <React.Fragment key={pageNumber}>
                  {index > 0 && pageNumber - pageNumbers[index - 1] > 1 && (
                    <Pagination.Item>
                      <Pagination.Ellipsis />
                    </Pagination.Item>
                  )}
                  <Pagination.Item>
                    <Pagination.Link isActive={page === pageNumber} onPress={() => setPage(pageNumber)}>
                      {pageNumber}
                    </Pagination.Link>
                  </Pagination.Item>
                </React.Fragment>
              ))}
            </Pagination.Content>
          </Pagination>
        </div>
      )}
    </div>
  );
};
