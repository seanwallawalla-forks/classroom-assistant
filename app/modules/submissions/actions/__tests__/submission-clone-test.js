import { expect } from "chai"
import * as sinon from "sinon"

import { submissionCloneFunc, fetchCloneURL } from "../submission-clone"
import { clone } from "../../../../lib/cloneutils"

const nock = require("nock")
const keytar = require("keytar")

const ACCESS_TOKEN = "token"
const RANDOM_FILENAME = (Math.random().toString(36) + "00000").substr(2, 5)

const mockClonePath = "/tmp/" + RANDOM_FILENAME

describe("submissionClone", () => {
  let getState, dispatch, cloneURLMock

  const mockSubmission = {
    id: 1,
    username: "StudentEvelyn",
    displayName: "Evelyn",
    cloneStatus: "",
    cloneProgress: 0
  }

  const mockAssignment = {
    title: "Test Assignment",
    type: "individual",
    url: "http://classroom.github.com/classrooms/test-org/assignments/test-assignment",
    isFetching: false,
    error: null,
  }

  const mockSettings = {
    cloneDestination: "/some/clone/path"
  }

  beforeEach(() => {
    dispatch = sinon.spy()
    sinon.stub(keytar, "findPassword").returns(ACCESS_TOKEN)

    getState = () => ({
      settings: mockSettings,
      assignment: mockAssignment,
    })

    cloneURLMock = nock("http://classroom.github.com")
      .get("/api/internal/classrooms/test-org/assignments/test-assignment/assignment_repos/1/clone_url")
      .query({access_token: ACCESS_TOKEN})
  })

  afterEach(() => {
    keytar.findPassword.restore()
  })

  describe("#fetchCloneURL", () => {
    it("returns same temp clone url if both password are present", async () => {
      const url = "https://testuser:testpassword@github.com/test-org/test-assignment"
      cloneURLMock.reply(200, {
        temp_clone_url: url
      })

      const response = await fetchCloneURL(ACCESS_TOKEN, 1)(getState)
      expect(response).to.eq(url)
    })

    it("removes user if password is missing (public repo)", async () => {
      const url = "https://testuser:@github.com/test-org/test-assignment"
      cloneURLMock.reply(200, {
        temp_clone_url: url
      })

      const response = await fetchCloneURL(ACCESS_TOKEN, 1)(getState)
      expect(response).to.eq("https://github.com/test-org/test-assignment")
    })
  })

  describe("#submissionCloneFunc", () => {
    beforeEach(() => {
      cloneURLMock.reply(200, {
        temp_clone_url: "https://testuser:@github.com/test-org/test-assignment"
      })
    })

    it("dispatches an action to set the clone path of a submission", async () => {
      const submissionClone = submissionCloneFunc(clone)
      await submissionClone(mockSubmission, mockClonePath)(dispatch, getState)

      expect(dispatch.calledWithMatch({ type: "SUBMISSION_SET_CLONE_PATH", id: 1 })).is.true
    })

    it("dispatches an action to set the clone status of a submission", async () => {
      const submissionClone = submissionCloneFunc(clone)
      await submissionClone(mockSubmission, mockClonePath)(dispatch, getState)

      expect(dispatch.calledWithMatch({ type: "SUBMISSION_SET_CLONE_STATUS", id: 1 })).is.true
    })

    it("calls 'clone' helper utility with correct arguments", async () => {
      const cloneMock = sinon.stub()

      const submissionClone = submissionCloneFunc(cloneMock)
      await submissionClone(mockSubmission, mockClonePath)(dispatch, getState)

      // ignoring the second argument because we no longer mock the current Date
      expect(cloneMock.calledWithMatch("https://github.com/test-org/test-assignment")).is.true
    })

    it("dispatches correct error state when a clone error occurs", async () => {
      const cloneMock = sinon.spy(() => {
        return Promise.reject(new Error("something went wrong"))
      })

      const submissionClone = submissionCloneFunc(cloneMock)
      await submissionClone(mockSubmission, mockClonePath)(dispatch, getState)

      expect(dispatch.calledWithMatch({ type: "SUBMISSION_SET_CLONE_STATUS", id: 1, cloneStatus: "Clone failed: an error has occured." })).is.true
    })

    it("dispatches an action to update the clone progress when callbacks are fired by 'clone'", async () => {
      const cloneMock = function (repo, destination, progress) {
        return new Promise((resolve, reject) => {
          progress(0)
          progress(30)
          progress(100)
          resolve()
        })
      }

      const submissionClone = submissionCloneFunc(cloneMock)
      await submissionClone(mockSubmission, mockClonePath)(dispatch, getState)

      expect(dispatch.calledWithMatch({ type: "SUBMISSION_SET_CLONE_PROGRESS", id: 1, cloneProgress: 0 })).is.true
      expect(dispatch.calledWithMatch({ type: "SUBMISSION_SET_CLONE_PROGRESS", id: 1, cloneProgress: 30 })).is.true
      expect(dispatch.calledWithMatch({ type: "SUBMISSION_SET_CLONE_PROGRESS", id: 1, cloneProgress: 100 })).is.true
    })
  })
})
